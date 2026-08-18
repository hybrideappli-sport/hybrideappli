/**
 * AC8 — property-based : pour TOUT `HybridScoreContext` généré aléatoirement,
 *  1. `0 ≤ score ≤ 100` quand `status === 'available'` ;
 *  2. `score === null` SI ET SEULEMENT SI `status === 'calibration'` (AC8 — jamais de chiffre
 *     approximatif en calibration, jamais de `null` hors calibration).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeHybridScore } from "../hybrid-score/compute-hybrid-score";
import { createTraceFactory } from "../lib/trace";
import { FIXED_NOW } from "../../__fixtures__/hybrid-score";
import { TEST_RULESET } from "../../__fixtures__/ruleset";
import type { HybridScoreContext, HybridScoreSessionInput } from "@hybride/domain";

const SPORT_CODES = ["running", "cycling", "swimming", "strength_training", null] as const;

function isoDateDaysAgo(now: string, daysAgo: number): string {
  const d = new Date(`${now}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const arbitrarySession: fc.Arbitrary<HybridScoreSessionInput> = fc.record({
  daysAgo: fc.integer({ min: 0, max: 60 }),
  sportCode: fc.constantFrom(...SPORT_CODES),
  loadUnits: fc.integer({ min: 0, max: 500 }),
}).map(({ daysAgo, sportCode, loadUnits }) => ({
  loggedDate: isoDateDaysAgo(FIXED_NOW, daysAgo),
  sportId: sportCode,
  sportCode,
  loadUnits,
}));

const arbitraryContext: fc.Arbitrary<HybridScoreContext> = fc.record({
  firstLoggedDateDaysAgo: fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }),
  sessions: fc.array(arbitrarySession, { maxLength: 40 }),
}).map(({ firstLoggedDateDaysAgo, sessions }) => ({
  now: FIXED_NOW,
  firstLoggedDate: firstLoggedDateDaysAgo === null ? null : isoDateDaysAgo(FIXED_NOW, firstLoggedDateDaysAgo),
  sessions,
}));

describe("hybrid-score-bounds.property — AC8", () => {
  it("0 ≤ score ≤ 100, et score === null ⟺ status === 'calibration', pour tout contexte", () => {
    fc.assert(
      fc.property(arbitraryContext, (context) => {
        const result = computeHybridScore(context, TEST_RULESET, createTraceFactory(TEST_RULESET.version));

        expect(result.score === null).toBe(result.status === "calibration");

        if (result.status === "available") {
          expect(result.score).not.toBeNull();
          expect(result.score!).toBeGreaterThanOrEqual(0);
          expect(result.score!).toBeLessThanOrEqual(100);
          expect(Number.isInteger(result.score)).toBe(true);
        } else {
          expect(result.score).toBeNull();
        }

        // Les composantes normalisées restent elles aussi dans [0, 1] quel que soit le statut —
        // servies aux deux cartes volume/répartition même en calibration (ADR-014 §4).
        expect(result.components.volume.normalized).toBeGreaterThanOrEqual(0);
        expect(result.components.volume.normalized).toBeLessThanOrEqual(1);
        expect(result.components.consistency.normalized).toBeGreaterThanOrEqual(0);
        expect(result.components.consistency.normalized).toBeLessThanOrEqual(1);
        expect(result.components.diversity.normalized).toBeGreaterThanOrEqual(0);
        expect(result.components.diversity.normalized).toBeLessThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
  });
});
