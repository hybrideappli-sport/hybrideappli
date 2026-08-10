/**
 * AC8, 2ᵉ alinéa — "tant qu'un signal de fatigue ou de douleur actif est
 * présent (voir AC4 et AC9), toute hausse de charge est bloquée
 * indépendamment de l'échéance de révision hebdomadaire."
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { startOfIsoWeek } from "../lib/dates";
import type { PlanSnapshot } from "@hybride/domain";
import { FIXED_NOW, buildContext, buildPainEpisode, buildProfile, buildSessionLog } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

function fakePreviousPlan(lowTargetLoadUnits: number): PlanSnapshot {
  const weekStart = startOfIsoWeek(FIXED_NOW);
  return {
    objectiveId: "objective-1",
    startedOn: FIXED_NOW,
    horizonStart: weekStart,
    horizonEnd: weekStart,
    blocks: [],
    weeks: [
      {
        weekStart,
        isoWeek: "2026-W33",
        blockIndex: 0,
        detailLevel: "detailed",
        isDeload: false,
        targetLoadUnits: lowTargetLoadUnits,
        plannedIntenseSessions: 0,
        maxConsecutiveDaysWithoutRest: 6,
        traceIds: [],
      },
    ],
    sessions: [],
    nutritionDays: [],
  };
}

describe("guardrails-block-increase — AC8", () => {
  it("révision hebdomadaire SANS signal négatif actif : la hausse est autorisée", () => {
    const context = buildContext({
      trigger: "weekly_review",
      dataRegime: "declared",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
      previousPlan: fakePreviousPlan(50),
    });
    const { plan } = generatePlan(context, TEST_RULESET);
    expect(plan.weeks[0]!.targetLoadUnits).toBeGreaterThan(50);
  });

  it("révision hebdomadaire AVEC douleur active (persistent/acute) : la hausse reste bloquée", () => {
    const context = buildContext({
      trigger: "weekly_review",
      dataRegime: "declared",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
      previousPlan: fakePreviousPlan(50),
      painEpisodes: [buildPainEpisode({ level: "persistent", resolvedAt: null })],
    });
    const { plan, traces } = generatePlan(context, TEST_RULESET);
    expect(plan.weeks[0]!.targetLoadUnits).toBeLessThanOrEqual(50);
    expect(traces.some((t) => t.ruleId === "guardrails.no_increase_active_signal")).toBe(true);
  });

  it("révision hebdomadaire AVEC signal de fatigue récent (RPE élevé) : la hausse reste bloquée", () => {
    const context = buildContext({
      trigger: "weekly_review",
      dataRegime: "declared",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
      previousPlan: fakePreviousPlan(50),
      history: {
        sessionLogs: [buildSessionLog({ loggedDate: FIXED_NOW, rpe: 9, freshness: 4 })],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });
    const { plan } = generatePlan(context, TEST_RULESET);
    expect(plan.weeks[0]!.targetLoadUnits).toBeLessThanOrEqual(50);
  });
});
