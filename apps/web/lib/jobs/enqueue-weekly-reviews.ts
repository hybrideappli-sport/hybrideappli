import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { isoWeekLabel } from "../dates";
import { localClockParts } from "../orchestration/local-clock";
import { enqueueJob } from "./queue";

/** « Dimanche soir » (AC5, ADR-011 §1) — 18h locale, un choix documenté de `developer` (aucune
 * heure précise n'est fixée par la fiche produit ni par l'architecture). */
export const WEEKLY_REVIEW_ISO_WEEKDAY = 7; // dimanche (ISO 8601)
export const WEEKLY_REVIEW_LOCAL_HOUR = 18;

/**
 * `POST /api/v1/cron/enqueue-weekly-reviews` (cron horaire, ADR-011 §1) : enrôle chaque
 * utilisateur dont l'heure locale (`profiles.timezone`) vient d'atteindre dimanche 18h. Idempotent
 * par construction (`enqueueJob`, `idempotency_key = 'weekly_review:{user}:{isoWeek}'`) : rejouer
 * ce cron plusieurs fois dans l'heure n'enrôle jamais deux fois la même semaine ISO.
 */
export async function enqueueWeeklyReviews(admin: SupabaseClient<Database>, now: Date = new Date()): Promise<{ scanned: number; enqueued: number }> {
  const { data: profiles, error } = await admin.from("profiles").select("id, timezone");
  if (error) throw new Error(`enqueueWeeklyReviews: profiles — ${error.message}`);

  let enqueued = 0;
  for (const profile of profiles ?? []) {
    const clock = localClockParts(profile.timezone, now);
    if (clock.isoWeekday !== WEEKLY_REVIEW_ISO_WEEKDAY || clock.hour !== WEEKLY_REVIEW_LOCAL_HOUR) continue;

    const isoWeek = isoWeekLabel(clock.date);
    const result = await enqueueJob(admin, {
      kind: "weekly_review",
      userId: profile.id,
      idempotencyKey: `weekly_review:${profile.id}:${isoWeek}`,
      payload: { isoWeek },
      scheduledFor: now.toISOString(),
    });
    if (result.enqueued) enqueued += 1;
  }

  return { scanned: profiles?.length ?? 0, enqueued };
}
