/**
 * AC2 — objectif hors de portée détecté : jamais de plan silencieux,
 * toujours une proposition de négociation explicite.
 */

import { describe, expect, it } from "vitest";
import { evaluateObjectiveFeasibility } from "../objective-feasibility.js";
import { createTraceFactory } from "../lib/trace.js";
import { addDays } from "../lib/dates.js";
import { buildContext, buildObjective, buildProfile, FIXED_NOW } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

function evaluate(overridesContext: Parameters<typeof buildContext>[0]) {
  const context = buildContext(overridesContext);
  const traceFactory = createTraceFactory(TEST_RULESET.version);
  return evaluateObjectiveFeasibility(context, TEST_RULESET, traceFactory);
}

describe("evaluateObjectiveFeasibility — AC2", () => {
  it("réaliste : progression demandée sous le plafond composé sur la durée disponible", () => {
    const result = evaluate({
      profile: buildProfile({ declaredWeeklyHours: 6 }),
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 20), targetMetric: { targetWeeklyHours: 6.5 } }),
    });
    expect(result.status).toBe("realistic");
    expect(result.proposals).toHaveLength(0);
  });

  it("irréaliste : jamais de plan silencieux — toujours au moins une proposition de négociation", () => {
    const result = evaluate({
      profile: buildProfile({ declaredWeeklyHours: 3 }),
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 4), targetMetric: { targetWeeklyHours: 20 } }),
    });
    expect(result.status).toBe("unrealistic");
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(result.proposals.some((p) => p.kind === "adjusted_deadline")).toBe(true);
    expect(result.proposals.some((p) => p.kind === "intermediate_objective")).toBe(true);
    for (const proposal of result.proposals) {
      expect(proposal.rationale.length).toBeGreaterThan(0);
    }
  });

  it("Thomas peut confirmer son objectif initial en connaissance de cause (la proposition n'est jamais imposée par le moteur)", () => {
    const result = evaluate({
      profile: buildProfile({ declaredWeeklyHours: 3 }),
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 4), targetMetric: { targetWeeklyHours: 20 } }),
    });
    // Le moteur ne fait que proposer : `objective.status`/`user_decision` ne sont jamais écrits ici.
    expect(result.status).toBe("unrealistic");
    expect(result.trace.output.field).toBe("feasibility_status");
  });

  it("date cible déjà dépassée ⟹ unrealistic avec proposition de délai ajusté", () => {
    const result = evaluate({ objective: buildObjective({ targetDate: addDays(FIXED_NOW, -10), targetMetric: { targetWeeklyHours: 6 } }) });
    expect(result.status).toBe("unrealistic");
    expect(result.proposals.some((p) => p.kind === "adjusted_deadline")).toBe(true);
  });

  it("sans date cible ni cible de volume explicite, réaliste par défaut (pas de faux diagnostic)", () => {
    const result = evaluate({ objective: buildObjective({ targetDate: null }) });
    expect(result.status).toBe("realistic");
  });

  it("zone intermédiaire ⟹ stretch, sans proposition (pas encore irréaliste)", () => {
    // ratio requis = 0.3 ; compoundedMax(2 semaines, cap 10%) = 0.21 ; stretchMax = 0.315 ⟹ stretch.
    const result = evaluate({
      profile: buildProfile({ declaredWeeklyHours: 5 }),
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 2), targetMetric: { targetWeeklyHours: 6.5 } }),
    });
    expect(result.status).toBe("stretch");
    expect(result.proposals).toHaveLength(0);
  });
});
