import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { addDaysIso } from "../dates";
import { getActiveRuleset } from "../orchestration/get-active-ruleset";
import { localClockParts } from "../orchestration/local-clock";
import { enqueueJob } from "./queue";

/** PostgREST plafonne par défaut à 1000 lignes par requête (finding I4, patron d'`enqueue-weekly-reviews.ts`). */
const PROFILES_PAGE_SIZE = 1000;

async function fetchAllProfiles(admin: SupabaseClient<Database>): Promise<Array<{ id: string; timezone: string }>> {
  const all: Array<{ id: string; timezone: string }> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, timezone")
      .eq("app_enrolled", true)
      .order("id", { ascending: true })
      .range(from, from + PROFILES_PAGE_SIZE - 1);
    if (error) throw new Error(`enqueueScheduleCloseouts: profiles — ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PROFILES_PAGE_SIZE) break;
    from += PROFILES_PAGE_SIZE;
  }
  return all;
}

/**
 * `POST /api/v1/cron/enqueue-schedule-closeouts` (cron HORAIRE, ADR-017 §1) : enrôle chaque
 * utilisateur dont l'heure locale vient d'atteindre `planning.closeout_local_hour` (défaut 03:00).
 * Idempotent par construction (`idempotency_key = 'schedule_closeout:{user}:{date locale J-1}'`) :
 * rejouer ce cron plusieurs fois dans l'heure n'enrôle jamais deux fois la même date de clôture.
 * Fenêtre `hour >= closeoutLocalHour` (jamais une égalité stricte) : même rationale qu'ADR-011 §1 /
 * finding I4 — un cron manqué à l'heure pile est rattrapé aux passages suivants de la même heure.
 */
export async function enqueueScheduleCloseouts(admin: SupabaseClient<Database>, now: Date = new Date()): Promise<{ scanned: number; enqueued: number }> {
  const ruleset = await getActiveRuleset(admin);
  const closeoutLocalHour = ruleset.params.planning.closeout_local_hour;

  const profiles = await fetchAllProfiles(admin);

  let enqueued = 0;
  for (const profile of profiles) {
    const clock = localClockParts(profile.timezone, now);
    if (clock.hour < closeoutLocalHour) continue;

    const closureDate = addDaysIso(clock.date, -1); // « date locale J-1 »
    const result = await enqueueJob(admin, {
      kind: "schedule_closeout",
      userId: profile.id,
      idempotencyKey: `schedule_closeout:${profile.id}:${closureDate}`,
      payload: { localDate: closureDate },
      scheduledFor: now.toISOString(),
    });
    if (result.enqueued) enqueued += 1;
  }

  return { scanned: profiles.length, enqueued };
}
