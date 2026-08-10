import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { acknowledgeDisclaimer, completeChatSteps, grantHealthConsent, signInAsNewTestUser } from "./onboarding-flow";

/**
 * Support E2E de la boucle quotidienne (Lot L4). `pickTrainingDays()` recopie EXACTEMENT
 * l'algorithme du moteur (`packages/rules-engine/src/pipeline/09-build-sessions.ts`,
 * `max_consecutive_days_without_rest = 6` — valeur du ruleset `0.1.0-dev`, `supabase/seed.sql`) :
 * nécessaire pour choisir, de façon déterministe, un nombre de séances/semaine déclaré au chat qui
 * GARANTIT qu'« aujourd'hui » (jour réel d'exécution du test, quel qu'il soit) tombe sur un jour
 * entraîné — `daily-loop.spec.ts` a besoin d'une séance réelle, pas d'un jour de repos.
 */
function pickTrainingDays(count: number, maxConsecutiveDaysWithoutRest: number): number[] {
  const cappedCount = Math.max(0, Math.min(count, Math.min(7, maxConsecutiveDaysWithoutRest)));
  if (cappedCount === 0) return [];
  const days = new Set<number>();
  for (let i = 0; i < cappedCount; i++) {
    const day = 1 + Math.round((i * 7) / cappedCount);
    days.add(Math.min(7, Math.max(1, day)));
  }
  let candidate = 1;
  while (days.size < cappedCount && candidate <= 7) {
    days.add(candidate);
    candidate++;
  }
  return Array.from(days).sort((a, b) => a - b);
}

const MAX_CONSECUTIVE_DAYS_WITHOUT_REST = 6; // `supabase/seed.sql` — ruleset `0.1.0-dev`.

/** 1 = lundi … 7 = dimanche, dans le même fuseau que `todayInTimezone()` (`Europe/Paris` par défaut, H8). */
function isoWeekdayInTimezone(timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[label] ?? 1;
}

/** Le plus petit nombre de séances/semaine (1 à 6) dont `pickTrainingDays` couvre le jour donné. */
function weeklySessionsCoveringWeekday(weekday: number): number {
  for (let n = 1; n <= MAX_CONSECUTIVE_DAYS_WITHOUT_REST; n++) {
    if (pickTrainingDays(n, MAX_CONSECUTIVE_DAYS_WITHOUT_REST).includes(weekday)) return n;
  }
  return MAX_CONSECUTIVE_DAYS_WITHOUT_REST; // défensif — inatteignable (couverture vérifiée manuellement).
}

/** Message `history` (étape chat) garantissant qu'« aujourd'hui » est un jour entraîné dans le plan généré. */
export function historyMessageWithSessionToday(timezone = "Europe/Paris"): string {
  const n = weeklySessionsCoveringWeekday(isoWeekdayInTimezone(timezone));
  return `Je m'entraîne ${n} fois par semaine, environ ${(n * 1.5).toFixed(1)} heures au total`;
}

/** Message `history` garantissant qu'« aujourd'hui » n'a AUCUNE séance (0 séance déclarée ⟹ jamais de jour entraîné). */
export const HISTORY_MESSAGE_NO_TRAINING = "0 séance par semaine, 0 heure en ce moment";

/**
 * Golden path complet jusqu'au Dashboard (AC1, AC3) — mêmes étapes que `onboarding.spec.ts`,
 * factorisées ici pour les scénarios de boucle quotidienne qui partent tous d'un plan déjà généré.
 */
export async function completeOnboardingToDashboard(page: Page, label: string, historyMessage?: string): Promise<void> {
  await signInAsNewTestUser(page, label);
  await page.goto("/onboarding/chat");
  await completeChatSteps(page, "Courir 10 km sans me blesser", historyMessage);
  await acknowledgeDisclaimer(page);
  await grantHealthConsent(page);

  await expect(page).toHaveURL(/\/onboarding\/recap$/);
  await page.getByRole("button", { name: /valider mon profil et générer mon plan/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
}
