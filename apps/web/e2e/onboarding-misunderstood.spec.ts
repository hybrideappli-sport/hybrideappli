import { test, expect } from "@playwright/test";

import { answerChat, signInAsNewTestUser } from "./support/onboarding-flow";

/**
 * `04-flow.md` — réponse utilisateur incompréhensible ⟹ le coach reformule sa question, sans
 * faire progresser l'onboarding sur une donnée invalide (ADR-002 §2 : une extraction rejetée par
 * le schéma Zod ne fait jamais avancer l'étape).
 *
 * Déclenchement déterministe (mock) : l'étape `level` a un vocabulaire fermé (« débutant »,
 * « intermédiaire », « avancé ») — toute autre réponse produit une reformulation.
 */
test("onboarding — réponse incompréhensible : le coach reformule sans avancer", async ({ page }) => {
  await signInAsNewTestUser(page, "onboarding-misunderstood");
  await page.goto("/onboarding/chat");

  await answerChat(page, "Courir un semi-marathon");
  await answerChat(page, "bleh je sais pas trop, un peu de tout quoi");

  const lastBubble = page.getByTestId("chat-bubble").last();
  await expect(lastBubble).toHaveAttribute("data-role", "coach");
  await expect(lastBubble).toHaveAttribute("data-reformulation", "true");
  await expect(lastBubble).toContainText(/pas bien compris/i);

  // Toujours sur le chat : aucune progression vers le disclaimer sur une donnée invalide.
  await expect(page).toHaveURL(/\/onboarding\/chat$/);

  // Une réponse valide fait progresser normalement, sans reformulation.
  await answerChat(page, "Niveau intermédiaire");
  const afterValidAnswer = page.getByTestId("chat-bubble").last();
  await expect(afterValidAnswer).toHaveAttribute("data-role", "coach");
  await expect(afterValidAnswer).toHaveAttribute("data-reformulation", "false");
});
