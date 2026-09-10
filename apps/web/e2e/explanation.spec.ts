import { test, expect } from "./support/test";

import { completeOnboardingToDashboard } from "./support/daily-loop-flow";

/**
 * `explanation.spec.ts` — AC1, AC5. Explication courte visible par défaut sur chaque
 * recommandation du coach ; « en savoir plus » ouvre le raisonnement complet.
 */
test("explicabilité — explication courte visible, « en savoir plus » ouvre le raisonnement complet", async ({ page }) => {
  await completeOnboardingToDashboard(page, "explanation");

  await expect(page.getByTestId("coach-plan-card")).toBeVisible();
  const explanation = page.getByTestId("coach-plan-card").getByTestId("explanation-inline").first();
  await expect(explanation).toBeVisible();
  const shortText = (await explanation.locator("p").first().textContent())?.trim() ?? "";
  expect(shortText.length).toBeGreaterThan(0);

  await expect(explanation.getByTestId("explanation-sheet")).toHaveCount(0);
  await explanation.getByTestId("explanation-more-link").click();

  const sheet = explanation.getByTestId("explanation-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toBeEmpty();
  const longText = (await sheet.textContent())?.trim() ?? "";
  expect(longText.length).toBeGreaterThan(0);
  // Le raisonnement complet dit RÉELLEMENT plus que le résumé court (AC5).
  expect(longText).not.toBe(shortText);
});
