/**
 * ADR-002 — même `PlanningContext` + même `Ruleset` ⟹ sortie strictement
 * identique. Vérifié à travers 100 itérations.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan.js";
import { buildContext } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

describe("determinism", () => {
  it("produit une sortie strictement identique sur 100 itérations (contexte simple)", () => {
    const context = buildContext();
    const first = generatePlan(context, TEST_RULESET);
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 100; i++) {
      const result = generatePlan(context, TEST_RULESET);
      expect(JSON.stringify(result)).toBe(firstJson);
    }
  });

  it("reste déterministe pour un contexte plus riche (multi-sports, historique, douleur, plan précédent)", () => {
    const base = buildContext({
      trigger: "weekly_review",
      sports: [
        { sportId: "s1", code: "running", family: "endurance", defaultMuscleGroups: ["quads", "hamstrings"], isDocumented: true, level: "intermediate", priority: 1, weeklySessionsDeclared: 4, isPrimary: true },
        { sportId: "s2", code: "strength_training", family: "strength", defaultMuscleGroups: ["full_body"], isDocumented: true, level: "intermediate", priority: 2, weeklySessionsDeclared: 2, isPrimary: false },
      ],
      dataRegime: "declared",
      history: {
        sessionLogs: [],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: Array.from({ length: 6 }, (_, i) => ({
          weekStart: `2026-0${(i % 6) + 1}-01`,
          completionRate: 0.85,
          avgRpe: 5,
          avgFreshness: 4,
          totalLoadUnits: 280 + i * 3,
          weightKg: 74,
          performanceTimeSec: null,
          energyAvg: 4,
        })),
      },
      painEpisodes: [
        {
          zone: "knee",
          level: "light",
          consecutiveSignals: 1,
          firstSignalOn: "2026-08-09",
          lastSignalOn: "2026-08-09",
          zoneBlocked: false,
          referralIssued: false,
          resolvedAt: null,
        },
      ],
    });
    const previousPlan = generatePlan({ ...base, trigger: "onboarding", previousPlan: null }, TEST_RULESET).plan;
    const context = { ...base, previousPlan };

    const first = JSON.stringify(generatePlan(context, TEST_RULESET));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(generatePlan(context, TEST_RULESET))).toBe(first);
    }
  });
});
