/**
 * AC14 — date cible atteinte ou dépassée : jamais de vide dans le plan.
 * Le moteur construit un horizon de transition/récupération et trace
 * explicitement le déclenchement de l'offre (nouvel objectif ou
 * transition), assemblée ensuite par l'orchestrateur.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { addDays } from "../lib/dates";
import { buildContext, buildObjective, FIXED_NOW } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("objective-end — AC14", () => {
  it("date cible dépassée ⟹ le plan n'est jamais vide (blocs, semaines, séances, nutrition présents)", () => {
    const context = buildContext({
      trigger: "objective_end",
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, -5) }),
    });
    const { plan } = generatePlan(context, TEST_RULESET);

    expect(plan.blocks.length).toBeGreaterThan(0);
    expect(plan.weeks.length).toBeGreaterThan(0);
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.nutritionDays.length).toBeGreaterThan(0);
  });

  it("le premier bloc devient une phase de transition/récupération, jamais une périodisation vers une cible passée", () => {
    const context = buildContext({
      trigger: "objective_end",
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, -1) }),
    });
    const { plan } = generatePlan(context, TEST_RULESET);
    expect(["transition", "recovery"]).toContain(plan.blocks[0]!.blockType);
  });

  it("une trace explicite documente le déclenchement de l'offre de fin d'objectif", () => {
    const context = buildContext({
      trigger: "objective_end",
      objective: buildObjective({ targetDate: addDays(FIXED_NOW, -30) }),
    });
    const { traces } = generatePlan(context, TEST_RULESET);
    const trace = traces.find((t) => t.ruleId === "objective_end.offer");
    expect(trace).toBeDefined();
    expect(trace!.scope).toBe("objective");
  });

  it("date cible non atteinte ⟹ pas de déclenchement de l'offre de fin d'objectif", () => {
    const context = buildContext({ objective: buildObjective({ targetDate: addDays(FIXED_NOW, 60) }) });
    const { traces, plan } = generatePlan(context, TEST_RULESET);
    expect(traces.some((t) => t.ruleId === "objective_end.offer")).toBe(false);
    expect(plan.blocks[0]!.blockType).not.toBe("transition");
  });
});
