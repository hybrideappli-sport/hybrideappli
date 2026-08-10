/**
 * ADR-002/ADR-003 — le moteur ne doit JAMAIS lire l'horloge système, le
 * réseau, ni une source d'aléa non injectée. On le prouve en remplaçant
 * `fetch`, `Date.now` et `Math.random` par des fonctions qui lèvent une
 * exception : le moteur doit s'exécuter identiquement, sans jamais les
 * appeler.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { evaluateObjectiveFeasibility } from "../objective-feasibility";
import { evaluateStagnation } from "../stagnation";
import { evaluatePainProtocol } from "../pain-protocol";
import { diffPlanVersions } from "../diff-plan-versions";
import { evaluateFreeAccess } from "../free-access";
import { createTraceFactory } from "../lib/trace";
import { buildContext, buildWeekAggregate } from "../../__fixtures__/planning-context";
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

describe("purity — zéro I/O", () => {
  it("generatePlan s'exécute sans jamais appeler fetch/Date.now/Math.random", () => {
    const context = buildContext();
    expect(() => generatePlan(context, TEST_RULESET)).not.toThrow();
  });

  it("evaluateObjectiveFeasibility est pure", () => {
    const context = buildContext();
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    expect(() => evaluateObjectiveFeasibility(context, TEST_RULESET, traceFactory)).not.toThrow();
  });

  it("evaluateStagnation est pure", () => {
    const context = buildContext({ history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks: [buildWeekAggregate()] } });
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    expect(() => evaluateStagnation(context, TEST_RULESET, traceFactory)).not.toThrow();
  });

  it("evaluatePainProtocol est pure", () => {
    const context = buildContext();
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    expect(() => evaluatePainProtocol(context, TEST_RULESET, traceFactory)).not.toThrow();
  });

  it("diffPlanVersions est pure", () => {
    const context = buildContext();
    const plan = generatePlan(context, TEST_RULESET).plan;
    expect(() => diffPlanVersions(null, plan)).not.toThrow();
    expect(() => diffPlanVersions(plan, plan)).not.toThrow();
  });

  it("evaluateFreeAccess est pure", () => {
    expect(() =>
      evaluateFreeAccess([{ accessedOn: "2026-08-10" }], "2026-08-10", { accessesPerPeriod: 3, windowStrategy: "fixed_week" }),
    ).not.toThrow();
  });
});
