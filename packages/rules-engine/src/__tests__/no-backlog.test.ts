/**
 * AC4 — "si Thomas n'a pas réalisé la séance, le coach ne fait apparaître ni
 * 'retard' ni rattrapage cumulatif : il reprogramme à partir de la
 * situation réelle du jour."
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { addDays } from "../lib/dates";
import { buildContext, buildSessionLog, FIXED_NOW } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("no-backlog — AC4", () => {
  it("3 séances non réalisées la semaine passée ne gonflent pas le volume de la semaine à venir (régime froid)", () => {
    const withoutMisses = buildContext({ dataRegime: "cold" });
    const withMisses = buildContext({
      dataRegime: "cold",
      history: {
        sessionLogs: [
          buildSessionLog({ id: "l1", loggedDate: addDays(FIXED_NOW, -1), completion: "not_done" }),
          buildSessionLog({ id: "l2", loggedDate: addDays(FIXED_NOW, -3), completion: "not_done" }),
          buildSessionLog({ id: "l3", loggedDate: addDays(FIXED_NOW, -5), completion: "not_done" }),
        ],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });

    const planWithout = generatePlan(withoutMisses, TEST_RULESET).plan;
    const planWith = generatePlan(withMisses, TEST_RULESET).plan;

    expect(planWith.weeks[0]!.targetLoadUnits).toBe(planWithout.weeks[0]!.targetLoadUnits);
    expect(planWith.sessions.length).toBe(planWithout.sessions.length);
  });

  it("le plan reprogrammé ne référence jamais les séances manquées comme un déficit à rattraper", () => {
    const context = buildContext({
      dataRegime: "cold",
      history: {
        sessionLogs: [buildSessionLog({ id: "l1", loggedDate: addDays(FIXED_NOW, -2), completion: "not_done" })],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });
    const { plan, traces } = generatePlan(context, TEST_RULESET);

    // Aucune trace ne mentionne un "rattrapage" / "makeup" / accumulation de retard.
    const suspiciousWording = /rattrap|makeup|backlog|retard cumul/i;
    for (const trace of traces) {
      expect(suspiciousWording.test(trace.conditionExpr)).toBe(false);
    }
    expect(plan.sessions.length).toBeGreaterThan(0);
  });
});
