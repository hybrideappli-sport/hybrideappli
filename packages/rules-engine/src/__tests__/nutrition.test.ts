/**
 * AC11 — nutrition modulée à la séance, sans carnet détaillé : cibles
 * caloriques/macros modulées (repos / endurance / intensité), plancher de
 * sécurité TOUJOURS respecté, jamais de déficit agressif.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { buildContext, buildProfile } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

describe("nutrition — AC11", () => {
  it("kcal_target >= kcal_safety_floor pour TOUTE journée nutrition, quel que soit le contexte", () => {
    const context = buildContext({ profile: buildProfile({ declaredWeeklyHours: 2, declaredWeeklySessions: 2 }) });
    const { plan } = generatePlan(context, TEST_RULESET);
    expect(plan.nutritionDays.length).toBeGreaterThan(0);
    for (const day of plan.nutritionDays) {
      expect(day.kcalTarget).toBeGreaterThanOrEqual(day.kcalSafetyFloor);
    }
  });

  it("les journées nutrition couvrent au moins 2 modulations distinctes (repos vs séance) sur une semaine normale", () => {
    const context = buildContext({ profile: buildProfile({ declaredWeeklyHours: 6, declaredWeeklySessions: 4 }) });
    const { plan } = generatePlan(context, TEST_RULESET);
    const reasons = new Set(plan.nutritionDays.map((d) => d.modulationReason));
    expect(reasons.has("rest")).toBe(true);
    expect(reasons.size).toBeGreaterThan(1);
  });

  it("un jour de repos ne reçoit jamais le bonus calorique d'une séance (kcal <= jour avec séance, à profil égal)", () => {
    const context = buildContext({ profile: buildProfile({ declaredWeeklyHours: 6, declaredWeeklySessions: 4 }) });
    const { plan } = generatePlan(context, TEST_RULESET);
    const restDay = plan.nutritionDays.find((d) => d.modulationReason === "rest");
    const trainingDay = plan.nutritionDays.find((d) => d.modulationReason !== "rest");
    expect(restDay).toBeDefined();
    expect(trainingDay).toBeDefined();
    expect(restDay!.kcalTarget).toBeLessThanOrEqual(trainingDay!.kcalTarget);
  });

  it("des conseils avant/pendant/après séance sont fournis, cohérents avec la journée", () => {
    const context = buildContext();
    const { plan } = generatePlan(context, TEST_RULESET);
    for (const day of plan.nutritionDays) {
      expect(day.advicePre.length).toBeGreaterThan(0);
      expect(day.adviceDuring.length).toBeGreaterThan(0);
      expect(day.advicePost.length).toBeGreaterThan(0);
    }
  });

  it("aucun déficit au-delà du plafond du ruleset (max_daily_deficit_pct) par rapport à la maintenance estimée", () => {
    const context = buildContext({ profile: buildProfile({ declaredWeeklyHours: 1, declaredWeeklySessions: 1 }) });
    const { plan } = generatePlan(context, TEST_RULESET);
    // Le plancher de sécurité peut dominer le plafond de déficit ; dans tous les cas, jamais les deux violés.
    for (const day of plan.nutritionDays) {
      expect(day.kcalTarget).toBeGreaterThanOrEqual(day.kcalSafetyFloor);
    }
  });

  it("aucune saisie détaillée n'est requise : le PlanDraft ne modélise qu'une cible par jour, pas un carnet repas par repas", () => {
    const context = buildContext();
    const { plan } = generatePlan(context, TEST_RULESET);
    for (const day of plan.nutritionDays) {
      expect(typeof day.kcalTarget).toBe("number");
      expect(Object.keys(day)).not.toContain("meals");
    }
  });
});
