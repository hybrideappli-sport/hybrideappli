import { test, expect } from "@playwright/test";

import { completeOnboardingToDashboard } from "./support/daily-loop-flow";
import { exhaustFreeAccessForUser } from "./support/free-access";

/**
 * `paywall.spec.ts` — AC13. 4ᵉ accès de la semaine ⟹ blocage non punitif, avec un chemin explicite
 * vers l'écran Abonnement. `exhaustFreeAccessForUser()` contourne le TEMPS réel (voir son en-tête
 * pour le détail du piège évité — 3 accès/semaine ne peuvent matériellement pas être épuisés avant
 * jeudi d'une semaine ISO donnée) par une fixture déterministe quel que soit le jour d'exécution.
 */
test("paywall — 4ᵉ accès de la semaine redirige vers l'abonnement, ton non punitif, la saisie reste accessible", async ({ page }) => {
  const { userId } = await completeOnboardingToDashboard(page, "paywall");

  const { restore } = await exhaustFreeAccessForUser(userId);
  try {
    await page.goto("/dashboard");

    const blocked = page.getByTestId("paywall-blocked");
    await expect(blocked).toBeVisible();
    // Ton non punitif (`04-flow.md`) : jamais de vocabulaire de sanction, un chemin de sortie clair.
    await expect(blocked).not.toContainText(/interdit|refusé|sanction/i);
    await expect(page.getByTestId("paywall-upgrade-link")).toHaveAttribute("href", "/abonnement");

    // Séance/Repas du jour est bloqué au même titre (AC13, même quota).
    await page.goto("/aujourdhui");
    await expect(page.getByTestId("paywall-blocked")).toBeVisible();

    // AC13/ADR-008 §5 — « la saisie reste accessible » : `POST /api/v1/session-logs` ne consomme
    // JAMAIS d'accès libre et reste utilisable même quota épuisé (contrairement à la LECTURE de
    // `/plan/today`/`/aujourdhui`, elle, bloquée ci-dessus).
    const response = await page.request.post("/api/v1/session-logs", {
      data: { plannedSessionId: null, loggedDate: new Date().toISOString().slice(0, 10), completion: "not_done", pain: "none" },
    });
    expect(response.ok()).toBe(true);
  } finally {
    await restore();
  }
});
