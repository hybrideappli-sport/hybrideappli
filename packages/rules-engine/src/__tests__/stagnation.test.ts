/**
 * AC6 — détection de stagnation avec diagnostic différencié : 3 causes
 * distinctes sur 3 jeux de données distincts, jamais de "durcissement" du
 * plan en réponse à une inobservance détectée.
 */

import { describe, expect, it } from "vitest";
import { evaluateStagnation } from "../stagnation.js";
import { createTraceFactory } from "../lib/trace.js";
import { buildContext, buildWeekAggregate } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

function weeksDataset(previous: Partial<ReturnType<typeof buildWeekAggregate>>, recent: Partial<ReturnType<typeof buildWeekAggregate>>) {
  const previousWeeks = Array.from({ length: 4 }, (_, i) => buildWeekAggregate({ weekStart: `2026-06-0${i + 1}`, ...previous }));
  const recentWeeks = Array.from({ length: 4 }, (_, i) => buildWeekAggregate({ weekStart: `2026-07-0${i + 1}`, ...recent }));
  return [...previousWeeks, ...recentWeeks];
}

function evaluate(completedWeeks: ReturnType<typeof buildWeekAggregate>[]) {
  const context = buildContext({ history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks } });
  const traceFactory = createTraceFactory(TEST_RULESET.version);
  return evaluateStagnation(context, TEST_RULESET, traceFactory);
}

describe("evaluateStagnation — AC6", () => {
  it("sous-stimulation : charge stable, adhérence haute, RPE stable ⟹ diagnosis='understimulation'", () => {
    const dataset = weeksDataset(
      { totalLoadUnits: 300, completionRate: 0.9, avgRpe: 5 },
      { totalLoadUnits: 300, completionRate: 0.9, avgRpe: 5 },
    );
    const result = evaluate(dataset);
    expect(result.status).toBe("stagnation");
    expect(result.diagnosis).toBe("understimulation");
    expect(result.recommendedAction).toBe("increase_load");
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("surcharge/fatigue accumulée : charge stable, RPE en forte hausse ⟹ diagnosis='overload'", () => {
    const dataset = weeksDataset(
      { totalLoadUnits: 300, completionRate: 0.9, avgRpe: 5 },
      { totalLoadUnits: 300, completionRate: 0.9, avgRpe: 7.5 },
    );
    const result = evaluate(dataset);
    expect(result.status).toBe("stagnation");
    expect(result.diagnosis).toBe("overload");
    expect(result.recommendedAction).toBe("deload");
  });

  it("inobservance : taux de complétion bas ⟹ diagnosis='nonadherence', ajustement à la réalité — JAMAIS de durcissement", () => {
    const dataset = weeksDataset(
      { totalLoadUnits: 300, completionRate: 0.9, avgRpe: 5 },
      { totalLoadUnits: 300, completionRate: 0.4, avgRpe: 5 },
    );
    const result = evaluate(dataset);
    expect(result.status).toBe("stagnation");
    expect(result.diagnosis).toBe("nonadherence");
    expect(result.recommendedAction).toBe("adjust_to_real_life");
    expect(result.recommendedAction).not.toBe("increase_load");
  });

  it("progression réelle détectée ⟹ status='no_stagnation'", () => {
    const dataset = weeksDataset({ totalLoadUnits: 300 }, { totalLoadUnits: 340 });
    const result = evaluate(dataset);
    expect(result.status).toBe("no_stagnation");
    expect(result.diagnosis).toBeNull();
  });
});
