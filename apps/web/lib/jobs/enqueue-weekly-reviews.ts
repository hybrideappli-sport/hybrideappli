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

/** PostgREST plafonne par défaut à 1000 lignes par requête (finding I4) — pagination explicite. */
const PROFILES_PAGE_SIZE = 1000;

async function fetchAllProfiles(admin: SupabaseClient<Database>): Promise<Array<{ id: string; timezone: string }>> {
  const all: Array<{ id: string; timezone: string }> = [];
  let from = 0;
  // Ordre stable (`id`) : indispensable pour que la pagination par `range()` ne saute ni ne
  // répète de ligne entre deux pages (PostgREST ne garantit un ordre cohérent que trié).
  for (;;) {
    const { data, error } = await admin.from("profiles").select("id, timezone").order("id", { ascending: true }).range(from, from + PROFILES_PAGE_SIZE - 1);
    if (error) throw new Error(`enqueueWeeklyReviews: profiles — ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PROFILES_PAGE_SIZE) break;
    from += PROFILES_PAGE_SIZE;
  }
  return all;
}

/**
 * `POST /api/v1/cron/enqueue-weekly-reviews` (cron horaire, ADR-011 §1) : enrôle chaque
 * utilisateur dont l'heure locale (`profiles.timezone`) vient d'atteindre dimanche 18h. Idempotent
 * par construction (`enqueueJob`, `idempotency_key = 'weekly_review:{user}:{isoWeek}'`) : rejouer
 * ce cron plusieurs fois dans l'heure n'enrôle jamais deux fois la même semaine ISO.
 *
 * Corrections post-revue (finding I4) :
 *   - Pagination explicite (`fetchAllProfiles`) : au-delà de 1000 comptes, la requête non paginée
 *     n'enrôlait purement et simplement plus les utilisateurs suivants, sans aucun signal.
 *   - Fenêtre `hour >= 18` (au lieu d'une égalité stricte `hour === 18`) : les crons Vercel n'ont
 *     aucune garantie d'exécution à la minute près ; une invocation manquée à 18h précises (déploi,
 *     incident transitoire) laissait la révision hebdomadaire définitivement perdue pour tout un
 *     fuseau, l'égalité stricte ne rattrapant jamais rien lors des passages suivants de la même
 *     heure. La fenêtre reste bornée à la journée ISO du dimanche (`isoWeekday === 7`) et
 *     l'idempotence par `isoWeek` garantit qu'un rattrapage à 19h/20h/… n'enrôle jamais deux fois.
 */
export async function enqueueWeeklyReviews(admin: SupabaseClient<Database>, now: Date = new Date()): Promise<{ scanned: number; enqueued: number }> {
  const profiles = await fetchAllProfiles(admin);

  let enqueued = 0;
  for (const profile of profiles) {
    const clock = localClockParts(profile.timezone, now);
    if (clock.isoWeekday !== WEEKLY_REVIEW_ISO_WEEKDAY || clock.hour < WEEKLY_REVIEW_LOCAL_HOUR) continue;

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

  return { scanned: profiles.length, enqueued };
}
