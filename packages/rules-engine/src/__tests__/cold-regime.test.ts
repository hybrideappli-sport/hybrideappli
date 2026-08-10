/**
 * AC12 — fonctionnement en régime froid : le profil déclaratif seul (sans
 * aucune donnée connectée, sans historique) suffit à générer un plan
 * complet et à l'ajuster.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan.js";
import { buildContext } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

describe("cold-regime — AC12", () => {
  it("génère un plan complet (blocs, semaines, séances, nutrition) avec dataRegime='cold' et aucun historique", () => {
    const context = buildContext({
      dataRegime: "cold",
      history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks: [] },
      painEpisodes: [],
      previousPlan: null,
    });

    const { plan, traces, confidence } = generatePlan(context, TEST_RULESET);

    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.weeks.length).toBeGreaterThan(0);
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.nutritionDays.length).toBeGreaterThan(0);
    expect(traces.length).toBeGreaterThan(0);
    expect(confidence).toBe("calibrating"); // AC7 : 0 semaine de données disponible
  });

  it("la disponibilité de données connectées n'est jamais une condition : le régime déclaré suffit et n'échoue jamais", () => {
    const declared = buildContext({ dataRegime: "declared" });
    const connected = buildContext({ dataRegime: "connected" });
    const cold = buildContext({ dataRegime: "cold" });

    for (const context of [declared, connected, cold]) {
      expect(() => generatePlan(context, TEST_RULESET)).not.toThrow();
    }
  });
});
