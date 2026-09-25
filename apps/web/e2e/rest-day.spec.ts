import { test, expect } from "./support/test";

import { completeOnboardingToDashboard, HISTORY_MESSAGE_NO_TRAINING } from "./support/daily-loop-flow";

/**
 * `rest-day.spec.ts` — jour de repos ⟹ état vide explicite, jamais une erreur (`04-flow.md`).
 * `0 séance déclarée` ⟹ `pickTrainingDays` ne planifie AUCUNE séance, quel que soit le jour réel
 * d'exécution du test (déterministe, voir `support/daily-loop-flow.ts`).
 */
test("jour de repos — état vide explicite sur le Dashboard et l'écran Séance/Repas du jour", async ({ page }) => {
  await completeOnboardingToDashboard(page, "rest-day", HISTORY_MESSAGE_NO_TRAINING);

  await expect(page.getByTestId("coach-plan-card")).toBeVisible();
  await expect(page.getByTestId("dashboard-rest-day")).toBeVisible();
  await expect(page.getByTestId("dashboard-rest-day")).toContainText(/jour de repos/i);

  await page.goto("/aujourdhui");
  await expect(page.getByTestId("rest-day-empty-state")).toBeVisible();
  await expect(page.getByTestId("session-detail")).toHaveCount(0);
  // Le check-in nutrition léger reste possible même un jour de repos (AC11) : pas d'erreur. Scopé à
  // <main> : la barre d'outils de dev Next.js peut porter son propre `role="alert"` hors de la page.
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});
