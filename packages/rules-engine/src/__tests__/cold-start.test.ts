/**
 * AC1 / AC12 — régime froid : volume de démarrage STRICTEMENT inférieur au
 * volume déclaré par l'utilisateur.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { buildContext, buildProfile } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("cold-start — AC1, AC12", () => {
  it("la première semaine du plan est strictement inférieure au volume hebdomadaire déclaré", () => {
    const declaredWeeklyHours = 8;
    const context = buildContext({ dataRegime: "cold", profile: buildProfile({ declaredWeeklyHours, declaredWeeklySessions: 5 }) });
    const { plan } = generatePlan(context, TEST_RULESET);

    const declaredWeeklyLoadUnitsApprox = declaredWeeklyHours * 36; // même heuristique que le moteur (lib interne)
    const firstWeek = plan.weeks[0]!;
    expect(firstWeek.targetLoadUnits).toBeLessThan(declaredWeeklyLoadUnitsApprox);
    expect(firstWeek.targetLoadUnits).toBe(Math.round(declaredWeeklyLoadUnitsApprox * TEST_RULESET.params.guardrails.cold_start_volume_ratio!));
  });

  it("une trace explicite justifie la réduction de démarrage prudent", () => {
    const context = buildContext({ dataRegime: "cold" });
    const { traces } = generatePlan(context, TEST_RULESET);
    const coldStartTrace = traces.find((t) => t.ruleId === "guardrails.cold_start_volume_ratio");
    expect(coldStartTrace).toBeDefined();
    expect(coldStartTrace!.isHardGuardrail).toBe(true);
  });
});
