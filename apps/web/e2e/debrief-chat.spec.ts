import { test, expect } from "./support/test";
import type { Page } from "@playwright/test";

import { completeOnboardingToDashboard, historyMessageWithSessionToday } from "./support/daily-loop-flow";

/**
 * `debrief-chat.spec.ts` — US-05, Lot L3 (ADR-019). Le débrief de la séance planifiée du jour, en
 * conversation sur `/aujourdhui`, avec le mock déterministe (`COACH_LLM_PROVIDER=mock`).
 *
 *   ① conversation → log → plan ajusté ;
 *   ② LLM en échec ⟹ formulaire, saisie possible ;
 *   ③ deux incompréhensions ⟹ chips.
 * Le ④ (paywall bloqué : formulaire, aucun appel LLM) vit dans `paywall.spec.ts`.
 */

async function openDebrief(page: Page, label: string) {
  await completeOnboardingToDashboard(page, label, historyMessageWithSessionToday());
  await page.goto("/aujourdhui");
  await expect(page.getByTestId("session-detail")).toBeVisible();
  await expect(page.getByTestId("debrief-chat")).toBeVisible();
}

async function say(page: Page, text: string) {
  const replies = page.getByTestId("debrief-chat").locator('[data-testid="chat-bubble"][data-role="coach"]');
  const before = await replies.count();
  await page.getByLabel("Ta réponse au coach").fill(text);
  await page.getByRole("button", { name: "Envoyer ma réponse" }).click();
  await expect(replies).toHaveCount(before + 1, { timeout: 15_000 });
}

test("① débrief en conversation — le log est écrit dès le trio, et un rpe élevé ajuste le plan", async ({ page }) => {
  await openDebrief(page, "debrief-conversation");

  await say(page, "Oui c'est fait");
  await say(page, "Aucune douleur");
  // Écriture précoce (ADR-019 §3) : le trio suffit, le retour s'affiche tout de suite.
  await expect(page.getByTestId("adjustment-feedback")).toBeVisible();
  await expect(page.getByTestId("adjustment-none")).toBeVisible();

  await say(page, "Franchement dur, 9 sur 10");
  await expect(page.getByTestId("adjustment-applied")).toBeVisible();

  // L'échange survit au rechargement, y compris après l'ajustement qui vient de régénérer le plan
  // (la séance du jour est alors une nouvelle ligne) : la conversation reprend là où elle en était.
  await page.reload();
  await expect(page.getByTestId("debrief-chat")).toContainText("Franchement dur, 9 sur 10");
});

test("② coach indisponible — l'écran bascule sur le formulaire, et la saisie aboutit", async ({ page }) => {
  await openDebrief(page, "debrief-llm-panne");

  await page.route("**/api/v1/debrief/**", (route) =>
    route.fulfill({ status: 503, json: { error: { code: "LLM_UNAVAILABLE", message: "Le coach ne peut pas répondre pour le moment." } } }),
  );
  await page.getByLabel("Ta réponse au coach").fill("Oui c'est fait");
  await page.getByRole("button", { name: "Envoyer ma réponse" }).click();

  await expect(page.getByTestId("debrief-fallback")).toContainText("Le coach ne peut pas répondre");
  await expect(page.getByTestId("daily-log-form")).toBeVisible();

  await page.getByLabel("Séance réalisée ?").selectOption("done");
  await page.getByLabel("Douleur ou gêne").selectOption("none");
  await page.getByRole("button", { name: /enregistrer ma séance/i }).click();
  await expect(page.getByTestId("adjustment-feedback")).toBeVisible({ timeout: 15_000 });
});

test("③ deux incompréhensions — le coach propose des chips, qui mènent au log et à l'ajustement", async ({ page }) => {
  await openDebrief(page, "debrief-chips");

  await say(page, "bof");
  await expect(page.getByTestId("debrief-closed-question")).toHaveCount(0);
  await say(page, "euh");

  const closed = page.getByTestId("debrief-closed-question");
  await expect(closed).toBeVisible();
  await closed.getByRole("radio", { name: "Faite", exact: true }).click();

  await expect(closed.getByRole("radiogroup", { name: "Douleur ou gêne" })).toBeVisible();
  await closed.getByRole("radio", { name: "Aucune", exact: true }).click();

  // `rpe` et `freshness` ensemble, en une seule question (ADR-019 §6).
  await expect(closed.getByRole("radiogroup", { name: "Effort, de 1 à 10" })).toBeVisible();
  await closed.getByRole("radiogroup", { name: "Effort, de 1 à 10" }).getByRole("radio", { name: "9", exact: true }).click();
  await closed.getByRole("radiogroup", { name: "Forme, de 1 à 5" }).getByRole("radio", { name: "2", exact: true }).click();
  await closed.getByRole("button", { name: "Envoyer" }).click();

  await expect(page.getByTestId("adjustment-applied")).toBeVisible({ timeout: 15_000 });
  // Échange clos : plus de champ de saisie.
  await expect(page.getByLabel("Ta réponse au coach")).toHaveCount(0);
});
