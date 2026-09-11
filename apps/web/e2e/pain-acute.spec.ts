import { test, expect } from "./support/test";

import { completeOnboardingToDashboard } from "./support/daily-loop-flow";

/**
 * `pain-acute.spec.ts` — AC9 niveau 3, ADR-008 §5. Douleur présente à l'effort ET au repos ⟹
 * orientation professionnel de santé affichée, **sans abonnement** (accès libre, jamais derrière
 * le paywall). Aucune alternative d'auto-adaptation n'est proposée à ce niveau.
 */
test("protocole douleur — douleur à l'effort et au repos déclenche l'orientation professionnel de santé", async ({ page }) => {
  await completeOnboardingToDashboard(page, "pain-acute");

  await page.goto("/aujourdhui");
  await expect(page.getByTestId("daily-log-form")).toBeVisible();

  await page.getByLabel("Séance réalisée ?").selectOption("partial");
  await page.getByLabel("Effort ressenti (RPE, 1 à 10)").fill("6");
  await page.getByLabel("Fraîcheur / sommeil (1 à 5)").fill("3");
  await page.getByLabel("Douleur ou gêne").selectOption("pain");
  await page.getByLabel("Localisation").selectOption("knee");
  // AC9 niveau 3 — question conditionnelle, affichée UNIQUEMENT quand "douleur" est sélectionné.
  await expect(page.getByLabel(/aussi présente au repos/i)).toBeVisible();
  await page.getByLabel(/aussi présente au repos/i).check();
  await page.getByLabel("Adhérence nutrition").selectOption("partial");
  await page.getByLabel("Énergie ressentie (1 à 5)").fill("2");
  await page.getByRole("button", { name: /enregistrer ma séance/i }).click();

  await expect(page.getByTestId("adjustment-feedback")).toBeVisible({ timeout: 15_000 });
  const referral = page.getByTestId("pain-referral-notice");
  await expect(referral).toBeVisible();
  await expect(referral).toContainText(/professionnel de santé/i);
  // AC9 — arrêt total de la zone, aucune alternative d'auto-adaptation proposée (formulation
  // explicite du message fixe, `pain-referral-messages.ts` — ne pas confondre avec le simple mot
  // « adaptation », que le message contient légitimement pour dire qu'il n'en propose PAS).
  await expect(referral).toContainText(/sans proposer d.auto-adaptation/i);

  // ADR-008 §5 — le référentiel douleur survit à la navigation et reste visible sur le Dashboard,
  // sans dépendre d'un abonnement (accès libre standard de ce test).
  await page.goto("/dashboard");
  await expect(page.getByTestId("pain-referral-notice")).toBeVisible();
});
