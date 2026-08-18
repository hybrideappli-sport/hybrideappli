/**
 * ADR-002/ADR-003 — `computeHybridScore()` ne doit JAMAIS lire l'horloge système, le réseau, ni
 * une source d'aléa non injectée. Même preuve que `purity.test.ts` (F1), appliquée à la fonction
 * ajoutée par l'US-02.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeHybridScore } from "../hybrid-score/compute-hybrid-score";
import { createTraceFactory } from "../lib/trace";
import { buildDailySessions, buildHybridScoreContext, FIXED_NOW } from "../../__fixtures__/hybrid-score";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
const originalMathRandom = Math.random;

function throwIfCalled(name: string) {
  return () => {
    throw new Error(`${name} was called — @hybride/rules-engine must be 0 I/O (ADR-002/ADR-003).`);
  };
}

beforeEach(() => {
  globalThis.fetch = throwIfCalled("fetch") as unknown as typeof fetch;
  Date.now = throwIfCalled("Date.now") as unknown as typeof Date.now;
  Math.random = throwIfCalled("Math.random") as unknown as typeof Math.random;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  Math.random = originalMathRandom;
});

describe("purity — computeHybridScore", () => {
  it("s'exécute sans jamais appeler fetch/Date.now/Math.random (contexte de calibration)", () => {
    const context = buildHybridScoreContext();
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    expect(() => computeHybridScore(context, TEST_RULESET, traceFactory)).not.toThrow();
  });

  it("s'exécute sans jamais appeler fetch/Date.now/Math.random (contexte hors calibration)", () => {
    const sessions = buildDailySessions(20, FIXED_NOW, 60);
    const context = buildHybridScoreContext({ firstLoggedDate: "2026-06-01", sessions });
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    expect(() => computeHybridScore(context, TEST_RULESET, traceFactory)).not.toThrow();
  });
});
