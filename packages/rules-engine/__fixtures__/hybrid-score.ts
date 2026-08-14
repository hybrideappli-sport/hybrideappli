/**
 * Fixtures de `HybridScoreContext` pour les tests de `@hybride/rules-engine` (US-02, ADR-014).
 *
 * `buildHybridScoreContext()` fournit un contexte minimal mais valide (aucune séance,
 * `firstLoggedDate = null` ⇒ calibration immédiate). Chaque test compose par-dessus.
 */

import type { HybridScoreContext, HybridScoreSessionInput } from "@hybride/domain";

export const FIXED_NOW = "2026-08-10"; // lundi

export function buildSession(overrides: Partial<HybridScoreSessionInput> = {}): HybridScoreSessionInput {
  return {
    loggedDate: FIXED_NOW,
    sportId: "sport-running",
    sportCode: "running",
    loadUnits: 60,
    ...overrides,
  };
}

export function buildHybridScoreContext(overrides: Partial<HybridScoreContext> = {}): HybridScoreContext {
  return {
    now: FIXED_NOW,
    firstLoggedDate: null,
    sessions: [],
    ...overrides,
  };
}

/**
 * Génère `count` séances régulières d'une discipline, une par jour, en remontant depuis `now`
 * (jour courant inclus), avec une charge constante `loadUnits`. Pratique pour construire un
 * historique "sorti de calibration" sans lister chaque séance à la main.
 */
export function buildDailySessions(
  count: number,
  now: string,
  loadUnits: number,
  sport: Pick<HybridScoreSessionInput, "sportId" | "sportCode"> = { sportId: "sport-running", sportCode: "running" },
): HybridScoreSessionInput[] {
  const sessions: HybridScoreSessionInput[] = [];
  const nowDate = new Date(`${now}T00:00:00.000Z`);
  for (let i = 0; i < count; i++) {
    const d = new Date(nowDate);
    d.setUTCDate(d.getUTCDate() - i);
    sessions.push({ loggedDate: d.toISOString().slice(0, 10), sportId: sport.sportId, sportCode: sport.sportCode, loadUnits });
  }
  return sessions;
}
