/**
 * AC7 — la composante V (charge soutenue, ADR-014 §1) est une courbe concave, SATURANTE : doubler
 * la charge au-delà de la référence n'augmente (quasiment) plus le score. Garantit que le score ne
 * récompense jamais la surcharge.
 */

import { describe, expect, it } from "vitest";
import { computeVolumeSubscore } from "../hybrid-score/volume";
import { buildDailySessions, FIXED_NOW } from "../../__fixtures__/hybrid-score";

const CHRONIC_WINDOW_DAYS = 28;
const REFERENCE = 700; // chronic_load_reference_units par défaut (ADR-014 §1)

describe("hybrid-score-volume — AC7 (courbe saturante)", () => {
  it("V est strictement croissante avec la charge en dessous de la référence", () => {
    const low = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, 10), CHRONIC_WINDOW_DAYS, REFERENCE);
    const mid = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, 50), CHRONIC_WINDOW_DAYS, REFERENCE);
    expect(mid.normalized).toBeGreaterThan(low.normalized);
  });

  it("V plafonne à 1 : aucune charge, aussi élevée soit-elle, ne dépasse la borne", () => {
    const huge = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, 100_000), CHRONIC_WINDOW_DAYS, REFERENCE);
    expect(huge.normalized).toBeLessThanOrEqual(1);
    expect(huge.normalized).toBeCloseTo(1, 6);
  });

  it("doubler une charge déjà largement au-delà de la référence n'augmente (quasiment) plus V", () => {
    const atTenXRef = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, Math.round((REFERENCE * 10) / 28)), CHRONIC_WINDOW_DAYS, REFERENCE);
    const atTwentyXRef = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, Math.round((REFERENCE * 20) / 28)), CHRONIC_WINDOW_DAYS, REFERENCE);
    const delta = atTwentyXRef.normalized - atTenXRef.normalized;
    expect(delta).toBeGreaterThanOrEqual(0); // jamais décroissante...
    expect(delta).toBeLessThan(0.05); // ...mais l'incrément devient négligeable
  });

  it("le même incrément de charge rapporte MOINS en partant de haut qu'en partant de bas (concavité)", () => {
    const from0to1x = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, Math.round(REFERENCE / 28)), CHRONIC_WINDOW_DAYS, REFERENCE).normalized;
    const from2xTo3x = (() => {
      const at2x = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, Math.round((REFERENCE * 2) / 28)), CHRONIC_WINDOW_DAYS, REFERENCE).normalized;
      const at3x = computeVolumeSubscore(buildDailySessions(28, FIXED_NOW, Math.round((REFERENCE * 3) / 28)), CHRONIC_WINDOW_DAYS, REFERENCE).normalized;
      return at3x - at2x;
    })();
    expect(from2xTo3x).toBeLessThan(from0to1x);
  });
});
