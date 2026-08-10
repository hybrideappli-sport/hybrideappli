/**
 * Arbitraires `fast-check` pour les tests property-based du moteur
 * (`guardrails.property.test.ts`, `asymmetry.property.test.ts`).
 */

import fc from "fast-check";
import { DATA_REGIMES, PLAN_TRIGGERS } from "@hybride/domain";
import type { AthleteSportSnapshot, PainEpisodeSnapshot, PlanningContext, SessionLogSnapshot } from "@hybride/domain";
import { generatePlan } from "../src/generate-plan.js";
import { addDays } from "../src/lib/dates.js";
import { TEST_RULESET } from "./ruleset.js";
import { FIXED_NOW, buildAvailability, buildContext, buildObjective, buildProfile, buildSport } from "./planning-context.js";

export const arbitraryTrigger = fc.constantFrom(...PLAN_TRIGGERS);

const FAMILIES = ["endurance", "strength", "mixed", "skill"] as const;
const MUSCLE_SETS: AthleteSportSnapshot["defaultMuscleGroups"][] = [
  ["quads", "hamstrings", "glutes", "calves", "core"],
  ["chest", "arms", "shoulders"],
  ["back", "core"],
  ["full_body"],
];

function buildSportArb(index: number) {
  return fc.record({
    familyIndex: fc.integer({ min: 0, max: FAMILIES.length - 1 }),
    priority: fc.integer({ min: 1, max: 3 }),
    isPrimary: fc.boolean(),
  }).map(({ familyIndex, priority, isPrimary }) =>
    buildSport({
      sportId: `sport-${index}`,
      code: `sport-${index}`,
      family: FAMILIES[familyIndex]!,
      defaultMuscleGroups: MUSCLE_SETS[familyIndex]!,
      priority,
      isPrimary,
    }),
  );
}

const arbitrarySessionLog = fc.record({
  dayOffset: fc.integer({ min: -10, max: 0 }),
  rpe: fc.integer({ min: 1, max: 10 }),
  freshness: fc.integer({ min: 1, max: 5 }),
  pain: fc.constantFrom("none", "light", "pain"),
});

/**
 * Contexte "de base" pour le property-based testing : couvre une large
 * variété de profils, régimes de données, triggers et horizons d'objectif —
 * y compris des cas limites (objectif déjà atteint, aucune date cible,
 * aucune disponibilité déclarée, aucun sport, signaux négatifs actifs).
 */
export const arbitraryPlanningContext: fc.Arbitrary<PlanningContext> = fc
  .record({
    trigger: arbitraryTrigger,
    declaredWeeklyHours: fc.double({ min: 1, max: 15, noNaN: true }),
    declaredWeeklySessions: fc.integer({ min: 1, max: 7 }),
    dataRegime: fc.constantFrom(...DATA_REGIMES),
    targetDateOffsetWeeks: fc.option(fc.integer({ min: -8, max: 60 }), { nil: null }),
    sportsCount: fc.integer({ min: 0, max: 3 }),
    sport0: buildSportArb(0),
    sport1: buildSportArb(1),
    sport2: buildSportArb(2),
    availabilityDaysCount: fc.integer({ min: 0, max: 7 }),
    sessionLogs: fc.array(arbitrarySessionLog, { maxLength: 5 }),
    hasOpenAcutePain: fc.boolean(),
    completedWeeksCount: fc.integer({ min: 0, max: 10 }),
  })
  .map((draw) => {
    const sportsAll = [draw.sport0, draw.sport1, draw.sport2].slice(0, draw.sportsCount);

    const availability = buildAvailability()
      .slice(0, draw.availabilityDaysCount)
      .map((a) => ({ ...a, isAvailable: true }));

    const sessionLogs: SessionLogSnapshot[] = draw.sessionLogs.map((s, i) => ({
      id: `log-${i}`,
      loggedDate: addDays(FIXED_NOW, s.dayOffset),
      sportId: sportsAll[0]?.sportId ?? null,
      plannedSessionId: null,
      completion: "done",
      actualDurationMin: 45,
      actualLoadUnits: 60,
      plannedLoadUnits: 60,
      rpe: s.rpe,
      freshness: s.freshness,
      pain: s.pain as SessionLogSnapshot["pain"],
      painZone: s.pain !== "none" ? "knee" : null,
      painAtRest: false,
    }));

    const painEpisodes: PainEpisodeSnapshot[] = draw.hasOpenAcutePain
      ? [
          {
            zone: "knee",
            level: "acute",
            consecutiveSignals: 3,
            firstSignalOn: addDays(FIXED_NOW, -10),
            lastSignalOn: FIXED_NOW,
            zoneBlocked: true,
            referralIssued: true,
            resolvedAt: null,
          },
        ]
      : [];

    const completedWeeks = Array.from({ length: draw.completedWeeksCount }, (_, i) => ({
      weekStart: addDays(FIXED_NOW, -7 * (draw.completedWeeksCount - i)),
      completionRate: 0.8,
      avgRpe: 5,
      avgFreshness: 4,
      totalLoadUnits: 250 + i * 5,
      weightKg: 75,
      performanceTimeSec: null,
      energyAvg: 4,
    }));

    return buildContext({
      trigger: draw.trigger,
      profile: buildProfile({ declaredWeeklyHours: draw.declaredWeeklyHours, declaredWeeklySessions: draw.declaredWeeklySessions }),
      sports: sportsAll,
      objective: buildObjective({
        targetDate: draw.targetDateOffsetWeeks === null ? null : addDays(FIXED_NOW, draw.targetDateOffsetWeeks * 7),
      }),
      availability,
      dataRegime: draw.dataRegime,
      history: {
        sessionLogs,
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks,
      },
      painEpisodes,
    });
  });

/**
 * Variante avec `previousPlan` déjà rempli (généré depuis un contexte
 * `onboarding` équivalent) — nécessaire pour exercer réellement l'invariant
 * d'asymétrie (avant/après ne peut être évalué sans version précédente).
 */
export const arbitraryPlanningContextWithPreviousPlan: fc.Arbitrary<PlanningContext> = arbitraryPlanningContext.map((context) => {
  const baseline = generatePlan({ ...context, trigger: "onboarding", previousPlan: null }, TEST_RULESET);
  return { ...context, previousPlan: baseline.plan };
});
