/**
 * AC1 — plan initial : blocs macro (base/développement/spécifique/affûtage),
 * détail complet J → J+7, aperçu "intention" J+8 → J+14, rien au-delà (macro
 * uniquement, agrégé par blocs/semaines).
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan.js";
import { addDays, diffDays } from "../lib/dates.js";
import { buildContext, buildObjective, FIXED_NOW } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

describe("generatePlan — AC1", () => {
  it("découpe l'horizon en blocs macro typés", () => {
    const context = buildContext({ objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 40) }) });
    const { plan } = generatePlan(context, TEST_RULESET);

    expect(plan.blocks.length).toBeGreaterThan(1);
    const types = new Set(plan.blocks.map((b) => b.blockType));
    expect(types.has("base")).toBe(true);
    expect(plan.blocks[plan.blocks.length - 1]!.blockType).toBe("taper");
  });

  it("détail complet (prescription) sur J → J+7 uniquement", () => {
    const context = buildContext();
    const { plan } = generatePlan(context, TEST_RULESET);

    const detailedSessions = plan.sessions.filter((s) => s.detailLevel === "detailed");
    for (const session of detailedSessions) {
      const offset = diffDays(FIXED_NOW, session.scheduledDate);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(6);
      expect(session.prescription).not.toBeNull();
    }
  });

  it('aperçu "intention" sans prescription sur J+8 → J+14', () => {
    const context = buildContext();
    const { plan } = generatePlan(context, TEST_RULESET);

    const intentSessions = plan.sessions.filter((s) => s.detailLevel === "intent");
    for (const session of intentSessions) {
      const offset = diffDays(FIXED_NOW, session.scheduledDate);
      expect(offset).toBeGreaterThanOrEqual(7);
      expect(offset).toBeLessThanOrEqual(13);
      expect(session.prescription).toBeNull();
    }
  });

  it("aucune séance planifiée au-delà de J+14", () => {
    const context = buildContext({ objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 30) }) });
    const { plan } = generatePlan(context, TEST_RULESET);

    for (const session of plan.sessions) {
      expect(diffDays(FIXED_NOW, session.scheduledDate)).toBeLessThanOrEqual(13);
    }
  });

  it("au-delà de J+14, seule une vue macro par blocs/semaines existe (aucune séance, aucune nutrition)", () => {
    const context = buildContext({ objective: buildObjective({ targetDate: addDays(FIXED_NOW, 7 * 30) }) });
    const { plan } = generatePlan(context, TEST_RULESET);

    const macroWeeks = plan.weeks.filter((w) => w.detailLevel === "macro");
    expect(macroWeeks.length).toBeGreaterThan(0);
    for (const week of macroWeeks) {
      expect(week.targetLoadUnits).toBeGreaterThanOrEqual(0);
    }
    expect(plan.nutritionDays.every((d) => diffDays(FIXED_NOW, d.date) <= 6)).toBe(true);
  });

  it("chaque recommandation du jour est accompagnée d'au moins une trace liée (traceIds non vide)", () => {
    const context = buildContext();
    const { plan } = generatePlan(context, TEST_RULESET);
    for (const session of plan.sessions) {
      expect(session.traceIds.length).toBeGreaterThan(0);
    }
    for (const day of plan.nutritionDays) {
      expect(day.traceIds.length).toBeGreaterThan(0);
    }
  });
});
