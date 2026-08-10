/**
 * "Toute valeur chiffrée du PlanDraft (durée, charge, intensité, kcal,
 * macros) doit être couverte par au moins une DecisionTrace" —
 * `07-spec-feature1-coach-ia.md` §5, ADR-002 §1, ADR-006. Vérifié par
 * assertion en fin de génération, pas seulement par convention.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { assertEveryNumberIsTraced } from "../pipeline/12-assert-every-number-is-traced";
import { buildContext, buildObjective, FIXED_NOW } from "../../__fixtures__/planning-context";
import { addDays } from "../lib/dates";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("traceability", () => {
  it("generatePlan ne lève pas — l'assertion interne passe sur un contexte riche", () => {
    const context = buildContext({ objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 20) }) });
    expect(() => generatePlan(context, TEST_RULESET)).not.toThrow();
  });

  it("chaque bloc, semaine, séance et journée nutrition du plan est couvert par >= 1 trace", () => {
    const context = buildContext();
    const { plan, traces } = generatePlan(context, TEST_RULESET);

    const covered = new Set(traces.map((t) => `${t.scope}:${t.scopeRefId ?? t.scopeRefDate ?? "none"}`));
    for (const block of plan.blocks) expect(covered.has(`block:${block.blockIndex}`)).toBe(true);
    for (const week of plan.weeks) expect(covered.has(`week:${week.weekStart}`)).toBe(true);
    for (const session of plan.sessions) expect(covered.has(`session:${session.scheduledDate}`)).toBe(true);
    for (const day of plan.nutritionDays) expect(covered.has(`nutrition_day:${day.date}`)).toBe(true);
  });

  it("assertEveryNumberIsTraced échoue le run si une valeur n'est couverte par aucune trace", () => {
    const context = buildContext();
    const { plan, traces } = generatePlan(context, TEST_RULESET);

    // Simule un bug amont : on retire toutes les traces d'une séance précise.
    const targetDate = plan.sessions[0]!.scheduledDate;
    const prunedTraces = traces.filter((t) => !(t.scope === "session" && t.scopeRefDate === targetDate));

    expect(() => assertEveryNumberIsTraced(plan, prunedTraces)).toThrow(/assertEveryNumberIsTraced/);
  });
});
