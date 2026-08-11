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

/** Déclenche `POST /api/v1/cron/drain-jobs` sur le serveur `next dev` réel (Playwright `webServer`). */
export async function drainJobsViaCron(baseURL: string): Promise<void> {
  const secret = requireCronSecret();
  const response = await fetch(`${baseURL}/api/v1/cron/drain-jobs`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[e2e] POST /cron/drain-jobs a échoué (${response.status}) : ${body}`);
  }
}
