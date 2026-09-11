/**
 * AC10 — interférence entre disciplines pratiquées en parallèle : espacement
 * minimal entre une séance intense et une séance de force sollicitant les
 * mêmes groupes musculaires, répartition de la charge globale (et non par
 * sport isolé), `interferenceNote` renseignée le cas échéant.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { buildContext, buildProfile } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

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

/**
 * Ruleset identique à celui publié, sauf l'espacement d'interférence remis à 48 h — soit DEUX jours
 * après conversion (`max(1, ceil(h / 24))`). Sert à couvrir le chemin d'ajustement lui-même, qui ne
 * se déclenche plus sur des séances de jours différents depuis que `1.0.0` publie 24 h.
 */
const RULESET_48H = {
  ...TEST_RULESET,
  params: {
    ...TEST_RULESET.params,
    interference: { ...TEST_RULESET.params.interference, min_hours_between_intense_and_strength_same_groups: 48 },
  },
};

function spacingPolicyDays(traces: ReturnType<typeof generatePlan>["traces"]): number | null {
  // `interference.spacing_adjustment` porte DEUX natures de traces : la politique (scope "plan",
  // émise par `resolveInterference`) et les ajustements réellement appliqués à une séance (scope
  // "session", émis par `buildSessions`). Seul le scope les distingue.
  const trace = traces.find((t) => t.ruleId === "interference.spacing_adjustment" && t.scope === "plan");
  const after = trace?.output.after;
  return typeof after === "number" ? after : null;
}

describe("interference — AC10", () => {
  it("la politique publiée espace d'UN jour : 24 h ⇒ « pas la même journée », rien de plus", () => {
    // Arbitrage du fondateur du 2026-09-10 (`docs/rulesets/1.0.0.md` §8). La méta-analyse ne
    // soutient une interférence que pour deux séances enchaînées dans la même session ; imposer une
    // journée pleine allégeait systématiquement le travail de force, soit la modalité dont la valeur
    // préventive est la mieux établie. Ce test verrouille la conversion heures ⇒ jours, qui est le
    // seul endroit où la valeur du ruleset produit un effet observable.
    const context = buildInterferenceContext();
    const { traces } = generatePlan(context, TEST_RULESET);
    expect(spacingPolicyDays(traces)).toBe(1);
  });

  it("une valeur de 48 h espace de DEUX jours — la conversion suit bien le ruleset, jamais une constante", () => {
    const context = buildInterferenceContext();
    const { traces } = generatePlan(context, RULESET_48H);
    expect(spacingPolicyDays(traces)).toBe(2);
  });

  it("sous une politique à deux jours, une séance de force suivant une séance intense sur les mêmes groupes est allégée et notée", () => {
    const context = buildInterferenceContext();
    const { plan, traces } = generatePlan(context, RULESET_48H);

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
