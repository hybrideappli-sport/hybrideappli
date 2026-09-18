import { createServiceRoleClient, requireCronSecret } from "./test-user";

/**
 * Support E2E du Lot L5 (`weekly-review.spec.ts`) : enrôle directement un job `weekly_review` en
 * base plutôt que d'attendre un dimanche 18h réel (`enqueueWeeklyReviews()`,
 * `apps/web/lib/jobs/enqueue-weekly-reviews.ts`) — même esprit que `createConfirmedTestUser()`
 * (contourne le TEMPS réel, pas la LOGIQUE de traitement testée, qui reste `runWeeklyReview()` via
 * `POST /api/v1/cron/drain-jobs`, appelé sur le VRAI serveur `next dev`).
 */
export async function enqueueWeeklyReviewJobForUser(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const idempotencyKey = `weekly_review:${userId}:e2e-${Date.now()}`;
  const { error } = await admin
    .from("job_queue")
    .insert({ kind: "weekly_review", user_id: userId, idempotency_key: idempotencyKey, payload: {}, scheduled_for: new Date().toISOString() });
  if (error) throw new Error(`[e2e] enqueue weekly_review job impossible : ${error.message}`);
}

/** Borne de sécurité : `DRAIN_BATCH_SIZE` vaut 10, et la suite complète n'accumule qu'une dizaine
 *  de jobs. 20 tours laissent une marge large tout en garantissant la terminaison. */
const MAX_DRAIN_ROUNDS = 20;

/**
 * Déclenche `POST /api/v1/cron/drain-jobs` sur le serveur `next dev` réel (Playwright `webServer`),
 * EN BOUCLE jusqu'à ce que la file soit vide.
 *
 * Un seul appel ne suffisait pas et rendait `weekly-review.spec.ts` dépendant de l'ordre
 * d'exécution : `claim_job_queue` réserve au plus `DRAIN_BATCH_SIZE` (10) jobs, par ordre
 * d'échéance. Lancé seul, le test n'avait que son propre job en file et passait ; lancé dans la
 * suite, les onboardings des autres specs avaient déjà enrôlé 8 `refresh_placements` échus plus
 * tôt, qui saturaient le lot. Le job `weekly_review` restait `pending`, `attempts = 0` — jamais
 * réservé, donc jamais exécuté, et le badge attendu n'apparaissait pas.
 *
 * Aucune modification du code de production : c'est le support de test qui doit drainer jusqu'au
 * bout, pas la taille de lot de la production qui doit s'adapter aux tests.
 */
export async function drainJobsViaCron(baseURL: string): Promise<void> {
  const secret = requireCronSecret();

  for (let round = 1; round <= MAX_DRAIN_ROUNDS; round++) {
    const response = await fetch(`${baseURL}/api/v1/cron/drain-jobs`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`[e2e] POST /cron/drain-jobs a échoué (${response.status}) : ${body}`);
    }

    const summary = (await response.json()) as { claimed?: number };
    // `claimed = 0` : plus aucun job échu et `pending` — la file est drainée.
    if (!summary.claimed) return;
  }

  throw new Error(`[e2e] file de jobs non drainée après ${MAX_DRAIN_ROUNDS} tours — un job échoue-t-il en boucle ?`);
}
