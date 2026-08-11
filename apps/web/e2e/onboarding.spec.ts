import { test, expect } from "@playwright/test";

import { signInAsNewTestUser, completeChatSteps, acknowledgeDisclaimer, grantHealthConsent } from "./support/onboarding-flow";

/**
 * Golden path (AC1, AC3) : inscription → chat → disclaimer acquitté → consentement santé →
 * récap validé → plan affiché (redirection Dashboard — le Dashboard réel est Lot L4, on vérifie
 * ici l'état final atteignable avec ce qui existe : la redirection post-génération de plan).
 */
test("onboarding — golden path : chat, disclaimer, consentement, récap, plan généré", async ({ page }) => {
  await signInAsNewTestUser(page, "onboarding-golden");

  await page.goto("/onboarding/chat");
  await completeChatSteps(page);

  // AC3 — le disclaimer est un écran BLOQUANT DÉDIÉ, pas noyé dans le chat.
  await expect(page).toHaveURL(/\/onboarding\/disclaimer$/);
  await expect(page.getByRole("heading", { name: /avertissement/i })).toBeVisible();
  await acknowledgeDisclaimer(page);

  // AC3 — le consentement santé est un écran DISTINCT du disclaimer.
  await expect(page).toHaveURL(/\/onboarding\/consentement$/);
  await grantHealthConsent(page);

  // AC1 — récap : l'utilisateur valide son profil avant toute génération de plan.
  await expect(page).toHaveURL(/\/onboarding\/recap$/);
  await expect(page.getByRole("heading", { name: /ton profil/i })).toBeVisible();
  await expect(page.getByText(/course a pied/i)).toBeVisible();

  await page.getByRole("button", { name: /valider mon profil et générer mon plan/i }).click();

  // AC1 — plan initial généré : redirection vers le Dashboard (placeholder Lot L1/L4).
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
