/**
 * AC5 — diff hebdomadaire lisible : chaque item porte au moins un
 * `decisionTraceId` (auditabilité, "en savoir plus"). `from = null` est le
 * cas explicite "première semaine, rien à comparer" (ADR-005).
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { diffPlanVersions } from "../diff-plan-versions";
import { addDays } from "../lib/dates";
import { buildContext, FIXED_NOW } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("diffPlanVersions — AC5", () => {
  it("from = null ⟹ première semaine, aucun item, jamais une erreur", () => {
    const context = buildContext();
    const plan = generatePlan(context, TEST_RULESET).plan;
    const diff = diffPlanVersions(null, plan);
    expect(diff.fromWeek).toBeNull();
    expect(diff.items).toHaveLength(0);
    expect(diff.toWeek).not.toBe("");
  });

  it("un diff entre deux versions consécutives porte des items avec >= 1 decisionTraceId chacun", () => {
    const baseContext = buildContext({ trigger: "onboarding", dataRegime: "declared" });
    const first = generatePlan(baseContext, TEST_RULESET).plan;

    const nextWeekContext = buildContext({
      trigger: "weekly_review",
      dataRegime: "declared",
      now: addDays(FIXED_NOW, 7),
      previousPlan: first,
    });
    const second = generatePlan(nextWeekContext, TEST_RULESET).plan;

    const diff = diffPlanVersions(first, second);
    expect(diff.fromWeek).not.toBeNull();
    expect(diff.items.length).toBeGreaterThan(0);
    for (const item of diff.items) {
      expect(item.decisionTraceIds.length).toBeGreaterThan(0);
      expect(["increase", "decrease", "neutral"]).toContain(item.direction);
    }
  });

  it("diff identique (même contexte rejoué) ⟹ aucun item", () => {
    const context = buildContext();
    const plan = generatePlan(context, TEST_RULESET).plan;
    const diff = diffPlanVersions(plan, plan);
    expect(diff.items).toHaveLength(0);
  });
});
