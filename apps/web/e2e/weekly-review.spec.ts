import { test, expect } from "./support/test";

import { completeOnboardingToDashboard } from "./support/daily-loop-flow";
import { drainJobsViaCron, enqueueWeeklyReviewJobForUser } from "./support/jobs";
import { upgradeToPremiumForUser } from "./support/subscriptions";

/**
 * `weekly-review.spec.ts` — AC5. Le rituel dominical n'a pas de fenêtre temporelle réelle à
 * attendre en E2E (ADR-011 : « dimanche 18h heure locale ») : ce test enrôle directement le job
 * `weekly_review` en base (`enqueueWeeklyReviewJobForUser`, contourne le TEMPS, pas la LOGIQUE) puis
 * déclenche `POST /api/v1/cron/drain-jobs` sur le VRAI serveur — `runWeeklyReview()` s'exécute donc
 * intégralement (moteur, matérialisation, diff, explications, notification).
 */
test("révision hebdomadaire — diff affiché avec avant/après lisible, badge Dashboard et notification", async ({ page, baseURL }) => {
  const { userId } = await completeOnboardingToDashboard(page, "weekly-review");

  // AC13 : la révision hebdomadaire COMPLÈTE (`/revision`) est réservée aux abonnés — ce test
  // vérifie AC5 (le diff lui-même), pas AC13 (la frontière paywall, couverte par `paywall.spec.ts`).
  await upgradeToPremiumForUser(userId);

  await enqueueWeeklyReviewJobForUser(userId);
  await drainJobsViaCron(baseURL!);

  // AC5 R8 — badge persistant Dashboard, garantie de repli si la notification n'arrive pas.
  await page.goto("/dashboard");
  await expect(page.getByTestId("weekly-review-badge-unread")).toBeVisible();
  await page.getByTestId("weekly-review-badge-link").click();
  await page.waitForURL("**/revision");

  await expect(page.getByTestId("plan-diff-view")).toBeVisible();
  await expect(page.getByTestId("plan-diff-summary")).not.toBeEmpty();

  // Onboarding → premier passage du rituel dominical : AUCUNE version de référence précédente —
  // cas explicite ADR-005, jamais laissé en erreur.
  await expect(page.getByTestId("first-week-notice")).toBeVisible();
});
