import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { runObjectiveCheck } from "../orchestration/run-objective-check";
import { runWeeklyReview } from "../orchestration/run-weekly-review";
import { todayInTimezone } from "../orchestration/today-in-timezone";
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
