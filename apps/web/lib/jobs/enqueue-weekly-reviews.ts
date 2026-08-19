import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { isoWeekLabel } from "../dates";
import { localClockParts } from "../orchestration/local-clock";
import { enqueueJob } from "./queue";

/** « Dimanche soir » (AC5, ADR-011 §1) — 18h locale, un choix documenté de `developer` (aucune
 * heure précise n'est fixée par la fiche produit ni par l'architecture). Borne basse de la fenêtre
 * de détection, voir le commentaire de `enqueueWeeklyReviews()` pour la borne haute. */
export const WEEKLY_REVIEW_ISO_WEEKDAY = 7; // dimanche (ISO 8601)
export const WEEKLY_REVIEW_LOCAL_HOUR = 18;
/** Borne haute de la fenêtre de détection (lundi, avant 20h locale) — voir le commentaire de
 * `enqueueWeeklyReviews()`. */
export const WEEKLY_REVIEW_CATCHUP_ISO_WEEKDAY = 1; // lundi (ISO 8601)
export const WEEKLY_REVIEW_CATCHUP_LOCAL_HOUR = 20;

/** PostgREST plafonne par défaut à 1000 lignes par requête (finding I4) — pagination explicite. */
const PROFILES_PAGE_SIZE = 1000;

async function fetchAllProfiles(admin: SupabaseClient<Database>): Promise<Array<{ id: string; timezone: string }>> {
  const all: Array<{ id: string; timezone: string }> = [];
  let from = 0;
  // Ordre stable (`id`) : indispensable pour que la pagination par `range()` ne saute ni ne
  // répète de ligne entre deux pages (PostgREST ne garantit un ordre cohérent que trié).
  //
  // `app_enrolled = true` (migration 0015) : exclut les comptes créés depuis le site club
  // (hybride-page) qui n'ont pas réellement engagé l'app — sans ce filtre, tout inscrit à une
  // sortie club recevait la révision hebdomadaire applicative.
  for (;;) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, timezone")
      .eq("app_enrolled", true)
      .order("id", { ascending: true })
      .range(from, from + PROFILES_PAGE_SIZE - 1);
    if (error) throw new Error(`enqueueWeeklyReviews: profiles — ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PROFILES_PAGE_SIZE) break;
    from += PROFILES_PAGE_SIZE;
  }
  return all;
}

/**
 * `POST /api/v1/cron/enqueue-weekly-reviews` (Vercel Cron QUOTIDIEN, ADR-011 §1 — mise à jour
 * « retour à Vercel Cron ») : enrôle chaque utilisateur dont l'heure locale (`profiles.timezone`)
 * se trouve dans la fenêtre de détection ci-dessous. Idempotent par construction (`enqueueJob`,
 * `idempotency_key = 'weekly_review:{user}:{isoWeek}'`) : repasser plusieurs fois dans cette
 * fenêtre n'enrôle jamais deux fois la même semaine ISO.
 *
 * **Fenêtre de détection élargie (2026-08-19, décision fondateur)** : `(isoWeekday === 7 && hour >=
 * 18) || (isoWeekday === 1 && hour < 20)`, soit dimanche 18h → lundi 20h locale, ~26 h de marge.
 * Nécessaire depuis le passage du cron d'une cadence horaire à une cadence QUOTIDIENNE (plan Vercel
 * Hobby, 1 exécution/jour max, imprécision ±59 min — ADR-011) : avec un passage par jour à un
 * instant UTC fixe, l'heure locale de déclenchement pour un fuseau donné reste quasi constante
 * d'un jour sur l'autre (±quelques minutes de jitter, hors transitions DST) ; une fenêtre bornée à
 * la seule journée ISO du dimanche (l'ancienne fenêtre `hour >= 18`, pensée pour un cron horaire)
 * ne recouvrirait le passage quotidien que ~25 % du temps selon le fuseau — ratant silencieusement
 * la majorité des utilisateurs chaque semaine. Une fenêtre de 26 h (> 24 h, la cadence du cron)
 * garantit mathématiquement qu'au moins un passage quotidien tombe dans la fenêtre pour CHAQUE
 * heure locale de déclenchement possible : tout `H` dans `[18, 24)` est capté le dimanche, tout `H`
 * dans `[0, 20)` est capté le lundi, et `[18, 24) ∪ [0, 20)` couvre les 24 h de la journée.
 * L'idempotence par `isoWeek` (calculé sur la date locale au moment de l'enrôlement, inchangée)
 * garantit qu'un utilisateur capté par la branche « lundi » n'est jamais enrôlé deux fois, même si
 * l'étiquette de semaine ISO qui en résulte diffère de celle qu'aurait produite la branche
 * « dimanche » — un rattrapage plusieurs jours de suite dans cette fenêtre élargie n'enrôle
 * toujours qu'UN SEUL job par semaine réelle.
 *
 * Corrections post-revue antérieures (finding I4), toujours en vigueur :
 *   - Pagination explicite (`fetchAllProfiles`) : au-delà de 1000 comptes, la requête non paginée
 *     n'enrôlait purement et simplement plus les utilisateurs suivants, sans aucun signal.
 *   - Fenêtre en `>=`/`<` (jamais une égalité stricte) : un cron manqué à l'heure pile ne perd
 *     jamais définitivement la révision hebdomadaire pour tout un fuseau.
 */
export async function enqueueWeeklyReviews(admin: SupabaseClient<Database>, now: Date = new Date()): Promise<{ scanned: number; enqueued: number }> {
  const profiles = await fetchAllProfiles(admin);

  let enqueued = 0;
  for (const profile of profiles) {
    const clock = localClockParts(profile.timezone, now);
    const withinSundayEvening = clock.isoWeekday === WEEKLY_REVIEW_ISO_WEEKDAY && clock.hour >= WEEKLY_REVIEW_LOCAL_HOUR;
    const withinMondayCatchup = clock.isoWeekday === WEEKLY_REVIEW_CATCHUP_ISO_WEEKDAY && clock.hour < WEEKLY_REVIEW_CATCHUP_LOCAL_HOUR;
    if (!withinSundayEvening && !withinMondayCatchup) continue;

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
