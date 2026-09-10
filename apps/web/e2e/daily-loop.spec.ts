import { test, expect } from "./support/test";

import { completeOnboardingToDashboard, historyMessageWithSessionToday } from "./support/daily-loop-flow";

/**
 * `daily-loop.spec.ts` — AC4. Dashboard → Séance du jour → saisie 4 signaux entraînement +
 * 2 signaux nutrition → retour avec ajustement (RPE élevé ⟹ baisse immédiate) et explication.
 */
test("boucle quotidienne — saisie post-séance déclenche un ajustement immédiat et son explication", async ({ page }) => {
  await completeOnboardingToDashboard(page, "daily-loop", historyMessageWithSessionToday());

  await expect(page.getByTestId("coach-plan-card")).toBeVisible();
  await page.getByRole("link", { name: /ouvrir ma séance/i }).click();
  await page.waitForURL("**/aujourdhui");

  await expect(page.getByTestId("session-detail")).toBeVisible();
  await expect(page.getByTestId("daily-log-form")).toBeVisible();

  await page.getByLabel("Séance réalisée ?").selectOption("done");
  // AC4 — RPE élevé (>= 8) : signal négatif, ajustement immédiat à la baisse (jamais à la hausse).
  await page.getByLabel("Effort ressenti (RPE, 1 à 10)").fill("9");
  await page.getByLabel("Fraîcheur / sommeil (1 à 5)").fill("2");
  await page.getByLabel("Douleur ou gêne").selectOption("none");
  await page.getByLabel("Adhérence nutrition").selectOption("high");
  await page.getByLabel("Énergie ressentie (1 à 5)").fill("3");
  await page.getByRole("button", { name: /enregistrer ma séance/i }).click();

  await expect(page.getByTestId("adjustment-feedback")).toBeVisible({ timeout: 15_000 });
  const adjustment = page.getByTestId("adjustment-applied");
  await expect(adjustment).toBeVisible();
  await expect(adjustment.getByTestId("explanation-inline")).toBeVisible();

  // AC5 — « en savoir plus » ouvre le raisonnement complet, en plus de l'explication courte.
  await adjustment.getByTestId("explanation-more-link").click();
  await expect(adjustment.getByTestId("explanation-sheet")).toBeVisible();
  await expect(adjustment.getByTestId("explanation-sheet")).not.toBeEmpty();
});
