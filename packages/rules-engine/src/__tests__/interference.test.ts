/**
 * AC10 — interférence entre disciplines pratiquées en parallèle : espacement
 * minimal entre une séance intense et une séance de force sollicitant les
 * mêmes groupes musculaires, répartition de la charge globale (et non par
 * sport isolé), `interferenceNote` renseignée le cas échéant.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan.js";
import { buildContext, buildProfile } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

const RUNNING = {
  sportId: "sport-running",
  code: "running",
  family: "endurance" as const,
  defaultMuscleGroups: ["quads", "hamstrings"] as const,
  isDocumented: true,
  level: "intermediate" as const,
  priority: 1,
  weeklySessionsDeclared: 6,
  isPrimary: true,
};

const STRENGTH = {
  sportId: "sport-strength",
  code: "strength_training",
  family: "strength" as const,
  // Recoupe volontairement les groupes de `running` pour ce test (dans le
  // référentiel réel, `strength_training` cible `full_body` — voir
  // `supabase/migrations/0010_seed_referentials.sql`).
  defaultMuscleGroups: ["quads", "hamstrings"] as const,
  isDocumented: true,
  level: "intermediate" as const,
  priority: 2,
  weeklySessionsDeclared: 6,
  isPrimary: false,
};

function buildInterferenceContext() {
  return buildContext({
    profile: buildProfile({ declaredWeeklyHours: 10, declaredWeeklySessions: 6 }),
    sports: [
      { ...RUNNING, defaultMuscleGroups: [...RUNNING.defaultMuscleGroups] },
      { ...STRENGTH, defaultMuscleGroups: [...STRENGTH.defaultMuscleGroups] },
    ],
  });
}

describe("interference — AC10", () => {
  it("une séance de force programmée juste après une séance intense sur les mêmes groupes est allégée et notée", () => {
    const context = buildInterferenceContext();
    const { plan, traces } = generatePlan(context, TEST_RULESET);

    const noted = plan.sessions.filter((s) => s.interferenceNote !== null);
    expect(noted.length).toBeGreaterThan(0);
    for (const session of noted) {
      expect(session.interferenceNote).toMatch(/espacement/i);
    }

    const interferenceTraces = traces.filter((t) => t.category === "interference" && t.ruleId === "interference.spacing_adjustment");
    expect(interferenceTraces.length).toBeGreaterThan(0);
  });

  it("la charge est répartie entre les deux disciplines pratiquées (pas uniquement sur la principale)", () => {
    const context = buildInterferenceContext();
    const { plan } = generatePlan(context, TEST_RULESET);

    const runningSessions = plan.sessions.filter((s) => s.sportCode === "running");
    const strengthSessions = plan.sessions.filter((s) => s.sportCode === "strength_training");
    expect(runningSessions.length).toBeGreaterThan(0);
    expect(strengthSessions.length).toBeGreaterThan(0);
  });

  it("une trace décrit la politique de répartition globale (AC10)", () => {
    const context = buildInterferenceContext();
    const { traces } = generatePlan(context, TEST_RULESET);
    expect(traces.some((t) => t.ruleId === "interference.sport_distribution")).toBe(true);
  });
});
