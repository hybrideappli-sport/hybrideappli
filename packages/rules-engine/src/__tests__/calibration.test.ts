/**
 * AC7 — phase de calibration explicite avant 4 semaines glissantes de
 * données : jamais de faux diagnostic ni de fausse assurance.
 */

import { describe, expect, it } from "vitest";
import { evaluateStagnation } from "../stagnation";
import { generatePlan } from "../generate-plan";
import { createTraceFactory } from "../lib/trace";
import { buildContext, buildWeekAggregate } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("calibration — AC7", () => {
  it("0 semaine de données ⟹ status='calibration', confidence='calibrating'", () => {
    const context = buildContext({ history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks: [] } });
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    const result = evaluateStagnation(context, TEST_RULESET, traceFactory);
    expect(result.status).toBe("calibration");
    expect(result.confidence).toBe("calibrating");
    expect(result.weeksAvailable).toBe(0);
    expect(result.weeksRequired).toBe(4);
    expect(result.diagnosis).toBeNull();
  });

  it("3 semaines de données (< 4) ⟹ toujours en calibration", () => {
    const completedWeeks = Array.from({ length: 3 }, (_, i) => buildWeekAggregate({ weekStart: `2026-07-0${i + 1}` }));
    const context = buildContext({ history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks } });
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    const result = evaluateStagnation(context, TEST_RULESET, traceFactory);
    expect(result.status).toBe("calibration");
  });

  it("4 semaines de données ⟹ sortie de calibration, un diagnostic devient possible", () => {
    const completedWeeks = Array.from({ length: 4 }, (_, i) => buildWeekAggregate({ weekStart: `2026-07-0${i + 1}` }));
    const context = buildContext({ history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks } });
    const traceFactory = createTraceFactory(TEST_RULESET.version);
    const result = evaluateStagnation(context, TEST_RULESET, traceFactory);
    expect(result.status).not.toBe("calibration");
  });

  it("generatePlan reflète aussi la calibration dans EngineResult.confidence (< 4 semaines)", () => {
    const context = buildContext({ history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks: [] } });
    const { confidence } = generatePlan(context, TEST_RULESET);
    expect(confidence).toBe("calibrating");
  });

  it("generatePlan reflète confidence='high' une fois calibré (>= 4 semaines)", () => {
    const completedWeeks = Array.from({ length: 5 }, (_, i) => buildWeekAggregate({ weekStart: `2026-07-0${i + 1}` }));
    const context = buildContext({ dataRegime: "declared", history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks } });
    const { confidence } = generatePlan(context, TEST_RULESET);
    expect(confidence).toBe("high");
  });
});
