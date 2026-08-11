import { test, expect } from "@playwright/test";

import {
  signInAsNewTestUser,
  completeChatSteps,
  acknowledgeDisclaimer,
  grantHealthConsent,
} from "./support/onboarding-flow";

/**
 * AC2 — objectif hors de portée détecté à l'onboarding : le coach ne génère jamais un plan
 * silencieusement inatteignable, il propose une négociation. Les DEUX issues sont vérifiées
 * (accepter une proposition / confirmer l'objectif initial), dans deux exécutions du parcours
 * jusqu'à l'écran de négociation.
 *
 * Déclenchement déterministe (mock, voir `packages/coach-llm/src/mock-provider.ts`) : un message
 * `goal` mentionnant une date cible déjà dépassée ET un volume hebdomadaire visé fait tomber
 * `evaluateObjectiveFeasibility` dans la branche « délai déjà expiré » — toujours `unrealistic`,
 * une seule proposition (`adjusted_deadline`).
 */
const UNREALISTIC_GOAL = "Courir un ultra-trail à 40h par semaine d'ici le 2020-01-01";

async function reachNegotiationScreen(page: import("@playwright/test").Page, label: string) {
  await signInAsNewTestUser(page, label);
  await page.goto("/onboarding/chat");
  await completeChatSteps(page, UNREALISTIC_GOAL);
  await acknowledgeDisclaimer(page);
  await grantHealthConsent(page);

  await expect(page).toHaveURL(/\/onboarding\/recap$/);
  await page.getByRole("button", { name: /valider mon profil et générer mon plan/i }).click();

  await expect(page.getByRole("heading", { name: /mérite d.être ajusté/i })).toBeVisible({ timeout: 20_000 });
}

test("onboarding — objectif irréaliste : accepter la proposition du coach", async ({ page }) => {
  await reachNegotiationScreen(page, "onboarding-negotiation-accept");

  await expect(page.getByText(/repousser la date cible/i)).toBeVisible();
  await page.getByRole("button", { name: /choisir cette proposition/i }).click();

  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("onboarding — objectif irréaliste : confirmer l'objectif initial en connaissance de cause", async ({ page }) => {
  await reachNegotiationScreen(page, "onboarding-negotiation-keep");

  await page.getByRole("button", { name: /je confirme mon objectif initial/i }).click();

  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
