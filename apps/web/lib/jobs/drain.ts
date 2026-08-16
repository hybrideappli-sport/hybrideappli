import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { runObjectiveCheck } from "../orchestration/run-objective-check";
import { runWeeklyReview } from "../orchestration/run-weekly-review";
import { todayInTimezone } from "../orchestration/today-in-timezone";
import { closeOutScheduleIncidents } from "../planning/close-out-schedule-incidents";
import { runRefreshPlacements } from "./refresh-placements";
import { runStravaActivitySync, runStravaBackfill, runStravaReconcile } from "./sync-data-connection";
import { claimJobs, markJobDone, markJobFailed } from "./queue";

export interface DrainSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  abandoned: number;
}

/**
 * `POST /api/v1/cron/drain-jobs` (toutes les 5 min, `maxDuration = 60`, ADR-011 §3/§7) : réserve un
 * lot borné (`claimJobs`, `FOR UPDATE SKIP LOCKED`) puis exécute chaque job selon son `kind`. Un
 * job en échec ne fait jamais échouer le lot entier — chacun est traité indépendamment, avec son
 * propre back-off/abandon (`markJobFailed`).
 */
export async function drainJobs(admin: SupabaseClient<Database>, limit: number): Promise<DrainSummary> {
  const jobs = await claimJobs(admin, limit);
  const summary: DrainSummary = { claimed: jobs.length, succeeded: 0, failed: 0, abandoned: 0 };

  for (const job of jobs) {
    try {
      if (!job.userId) throw new Error(`job ${job.id} (${job.kind}) sans user_id — jamais attendu pour ces types de jobs.`);

      if (job.kind === "weekly_review") {
        const { data: profileRow } = await admin.from("profiles").select("timezone").eq("id", job.userId).maybeSingle();
        const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
        await runWeeklyReview(admin, { userId: job.userId, now });
      } else if (job.kind === "objective_check") {
        const objectiveId = (job.payload as { objectiveId?: string }).objectiveId;
        if (!objectiveId) throw new Error(`job ${job.id} (objective_check) sans objectiveId dans le payload.`);
        const { data: profileRow } = await admin.from("profiles").select("timezone").eq("id", job.userId).maybeSingle();
        const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
        await runObjectiveCheck(admin, { userId: job.userId, objectiveId, now });
      } else if (job.kind === "strava_backfill") {
        const connectionId = (job.payload as { connectionId?: string }).connectionId;
        if (!connectionId) throw new Error(`job ${job.id} (strava_backfill) sans connectionId dans le payload.`);
        await runStravaBackfill(admin, { connectionId });
      } else if (job.kind === "strava_activity_sync") {
        const payload = job.payload as { connectionId?: string; activityId?: string; aspectType?: "create" | "update" | "delete" };
        if (!payload.connectionId || !payload.activityId || !payload.aspectType) {
          throw new Error(`job ${job.id} (strava_activity_sync) : payload incomplet (connectionId/activityId/aspectType).`);
        }
        await runStravaActivitySync(admin, { connectionId: payload.connectionId, activityId: payload.activityId, aspectType: payload.aspectType });
      } else if (job.kind === "strava_reconcile") {
        const connectionId = (job.payload as { connectionId?: string }).connectionId;
        if (!connectionId) throw new Error(`job ${job.id} (strava_reconcile) sans connectionId dans le payload.`);
        await runStravaReconcile(admin, { connectionId });
      } else if (job.kind === "refresh_placements") {
        // US-03, AC2 — enrôlé par le trigger `availability_slots_refresh_placements`
        // (`docs/db-schema.md` §11.4), jamais par une route applicative : aucun payload à valider.
        await runRefreshPlacements(admin, { userId: job.userId });
      } else if (job.kind === "schedule_closeout") {
        const localDate = (job.payload as { localDate?: string }).localDate;
        if (!localDate) throw new Error(`job ${job.id} (schedule_closeout) sans localDate dans le payload.`);
        await closeOutScheduleIncidents(admin, { userId: job.userId, localDate });
      } else {
        throw new Error(`job ${job.id} : kind inconnu "${job.kind}".`);
      }

      await markJobDone(admin, job.id);
      summary.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[drain-jobs] job ${job.id} (${job.kind}) a échoué : ${message}`);
      const { abandoned } = await markJobFailed(admin, { jobId: job.id, attempts: job.attempts, error: message });
      if (abandoned) summary.abandoned += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}
