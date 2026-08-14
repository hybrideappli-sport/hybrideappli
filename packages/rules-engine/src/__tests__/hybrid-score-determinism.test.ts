/**
 * ADR-002 — même `HybridScoreContext` + même `Ruleset` ⟹ sortie strictement identique.
 * Vérifié sur 100 itérations, comme `determinism.test.ts` (F1).
 */

import { describe, expect, it } from "vitest";
import { computeHybridScore } from "../hybrid-score/compute-hybrid-score";
import { createTraceFactory } from "../lib/trace";
import { buildDailySessions, buildHybridScoreContext, buildSession, FIXED_NOW } from "../../__fixtures__/hybrid-score";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("determinism — computeHybridScore", () => {
  it("produit une sortie strictement identique sur 100 itérations (contexte de calibration)", () => {
    const context = buildHybridScoreContext({ firstLoggedDate: "2026-08-05", sessions: [buildSession()] });
    const first = JSON.stringify(computeHybridScore(context, TEST_RULESET, createTraceFactory(TEST_RULESET.version)));
    for (let i = 0; i < 100; i++) {
      const result = computeHybridScore(context, TEST_RULESET, createTraceFactory(TEST_RULESET.version));
      expect(JSON.stringify(result)).toBe(first);
    }
  });

  it("produit une sortie strictement identique sur 100 itérations (contexte multi-disciplines, hors calibration)", () => {
    const sessions = [
      ...buildDailySessions(10, FIXED_NOW, 60, { sportId: "s1", sportCode: "running" }),
      ...buildDailySessions(6, FIXED_NOW, 45, { sportId: "s2", sportCode: "cycling" }),
      ...buildDailySessions(4, FIXED_NOW, 50, { sportId: "s3", sportCode: "strength_training" }),
    ];
    const context = buildHybridScoreContext({ firstLoggedDate: "2026-06-01", sessions });
    const first = JSON.stringify(computeHybridScore(context, TEST_RULESET, createTraceFactory(TEST_RULESET.version)));
    for (let i = 0; i < 100; i++) {
      const result = computeHybridScore(context, TEST_RULESET, createTraceFactory(TEST_RULESET.version));
      expect(JSON.stringify(result)).toBe(first);
    }
  });
});
