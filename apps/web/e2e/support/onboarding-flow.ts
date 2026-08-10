import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { createConfirmedTestUser } from "./test-user";

/** Inscription/connexion via le VRAI formulaire (`(auth)/connexion`) — cookies `@supabase/ssr` authentiques. */
export async function signInAsNewTestUser(page: Page, label: string): Promise<void> {
  const { email, password } = await createConfirmedTestUser(label);
  await page.goto("/connexion");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

/** Envoie une réponse dans le chat et attend la réplique du coach avant de continuer. */
export async function answerChat(page: Page, content: string): Promise<void> {
  const bubblesBefore = await page.getByTestId("chat-bubble").count();
  await page.getByLabel("Ta réponse au coach").fill(content);
  await page.getByRole("button", { name: "Envoyer" }).click();
  // Une bulle utilisateur, puis une bulle coach : au moins +2 par rapport à l'état précédent.
  await expect(page.getByTestId("chat-bubble")).toHaveCount(bubblesBefore + 2, { timeout: 15_000 });
  await expect(page.getByTestId("coach-typing-indicator")).toHaveCount(0);
}

/**
 * Golden path conversationnel (AC1) : 7 étapes de chat, un message par étape, en évitant
 * délibérément toute date + volume hebdomadaire explicites au step `goal` (sans quoi
 * `evaluateObjectiveFeasibility` peut basculer en négociation — voir `onboarding-negotiation.spec.ts`
 * pour ce cas précis).
 */
export async function completeChatSteps(
  page: Page,
  goalMessage = "Courir 10 km sans me blesser",
  historyMessage = "Je m'entraîne 4 fois par semaine, environ 5 heures au total",
): Promise<void> {
  await expect(page.getByTestId("chat-bubble").first()).toBeVisible();
  await answerChat(page, goalMessage);
  await answerChat(page, "Niveau intermédiaire");
  await answerChat(page, historyMessage);
  await answerChat(page, "Course à pied, musculation");
  await answerChat(page, "45 minutes par séance en général");
  await answerChat(page, "Pas de contrainte alimentaire particulière");
  await answerChat(page, "Non, aucun profil à risque");
}

export async function acknowledgeDisclaimer(page: Page): Promise<void> {
  await page.waitForURL("**/onboarding/disclaimer");
  await page.getByLabel("J'ai lu et je comprends cet avertissement").check();
  await page.getByRole("button", { name: "J'ai compris, continuer" }).click();
}

export async function grantHealthConsent(page: Page): Promise<void> {
  await page.waitForURL("**/onboarding/consentement");
  await page.getByLabel("Je consens au traitement de mes données de santé").check();
  await page.getByRole("button", { name: "J'accepte, continuer" }).click();
}
