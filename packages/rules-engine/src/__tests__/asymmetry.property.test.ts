/**
 * AC4 / ADR-005 §5 — asymétrie prudente contre le surentraînement.
 *
 * Property-based : pour tout contexte et tout déclencheur qui n'autorise
 * pas la hausse (`08-architecture.md` §4.3, ADR-005 §5 : tout trigger SAUF
 * `weekly_review` et `objective_renegotiation` — voir la constante
 * `TRIGGERS_ALLOWING_INCREASE` de `@hybride/domain/enums.ts` et le rapport
 * de fin de lot pour l'arbitrage documentaire sur ce point précis), AUCUNE
 * trace du run ne doit porter `direction = 'increase'`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TRIGGERS_ALLOWING_INCREASE } from "@hybride/domain";
import type { PlanTrigger } from "@hybride/domain";
import { generatePlan } from "../generate-plan.js";
import { arbitraryPlanningContext, arbitraryPlanningContextWithPreviousPlan } from "../../__fixtures__/arbitraries.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

const DISALLOWED_TRIGGERS: PlanTrigger[] = [
  "onboarding",
  "negative_signal",
  "pain_protocol",
  "stagnation",
  "objective_end",
  "manual_admin",
];

describe("asymmetry.property — AC4", () => {
  it("aucune trace direction='increase' pour tout trigger hors weekly_review/objective_renegotiation (sans plan précédent)", () => {
    fc.assert(
      fc.property(arbitraryPlanningContext, fc.constantFrom(...DISALLOWED_TRIGGERS), (context, trigger) => {
        const run = generatePlan({ ...context, trigger }, TEST_RULESET);
        const increases = run.traces.filter((t) => t.output.direction === "increase");
        expect(increases).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("aucune trace direction='increase' pour tout trigger hors weekly_review/objective_renegotiation (avec plan précédent — cas non trivial)", () => {
    fc.assert(
      fc.property(arbitraryPlanningContextWithPreviousPlan, fc.constantFrom(...DISALLOWED_TRIGGERS), (context, trigger) => {
        const run = generatePlan({ ...context, trigger }, TEST_RULESET);
        const increases = run.traces.filter((t) => t.output.direction === "increase");
        expect(increases).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("sanity check : la liste des triggers autorisant la hausse est exactement {weekly_review, objective_renegotiation}", () => {
    expect([...TRIGGERS_ALLOWING_INCREASE].sort()).toEqual(["objective_renegotiation", "weekly_review"]);
  });
});
