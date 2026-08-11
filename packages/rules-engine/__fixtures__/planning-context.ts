/**
 * Fixtures de `PlanningContext` pour les tests de `@hybride/rules-engine`.
 *
 * `buildContext()` fournit un contexte minimal mais complet et VALIDE
 * (profil déclaratif, un sport pratiqué, un objectif avec date cible
 * lointaine, régime froid, aucun historique). Chaque test compose par-dessus
 * avec des overrides ciblés plutôt que de reconstruire un contexte complet.
 */

import type {
  AthleteProfileSnapshot,
  AthleteSportSnapshot,
  AvailabilitySnapshot,
  BodyMetricSnapshot,
  NutritionCheckinSnapshot,
  ObjectiveSnapshot,
  PainEpisodeSnapshot,
  PlanningContext,
  RiskFlagSnapshot,
  SessionLogSnapshot,
  WeekAggregateSnapshot,
} from "@hybride/domain";

export const FIXED_NOW = "2026-08-10"; // lundi

export function buildProfile(overrides: Partial<AthleteProfileSnapshot> = {}): AthleteProfileSnapshot {
  return {
    userId: "user-1",
    birthDate: "1990-01-01",
    sexAtBirth: "male",
    heightCm: 178,
    experienceLevel: "intermediate",
    trainingYears: 5,
    declaredWeeklySessions: 5,
    declaredWeeklyHours: 6,
    dietaryConstraints: [],
    ...overrides,
  };
}

export function buildSport(overrides: Partial<AthleteSportSnapshot> = {}): AthleteSportSnapshot {
  return {
    sportId: "sport-running",
    code: "running",
    family: "endurance",
    defaultMuscleGroups: ["quads", "hamstrings", "glutes", "calves", "core"],
    isDocumented: true,
    level: "intermediate",
    priority: 1,
    weeklySessionsDeclared: 5,
    isPrimary: true,
    ...overrides,
  };
}

export function buildObjective(overrides: Partial<ObjectiveSnapshot> = {}): ObjectiveSnapshot {
  return {
    id: "objective-1",
    sportId: "sport-running",
    kind: "general_fitness",
    targetDate: "2027-01-01",
    targetMetric: {},
    status: "active",
    feasibility: null,
    ...overrides,
  };
}

export function buildAvailability(): AvailabilitySnapshot[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    slot: "unspecified" as const,
    maxMinutes: 90,
    isAvailable: true,
  }));
}

export function buildContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    now: FIXED_NOW,
    timezone: "Europe/Paris",
    trigger: "onboarding",
    profile: buildProfile(),
    sports: [buildSport()],
    objective: buildObjective(),
    riskFlags: [],
    availability: buildAvailability(),
    history: {
      sessionLogs: [],
      nutritionCheckins: [],
      bodyMetrics: [],
      completedWeeks: [],
    },
    painEpisodes: [],
    previousPlan: null,
    dataRegime: "cold",
    ...overrides,
  };
}

export function buildSessionLog(overrides: Partial<SessionLogSnapshot> = {}): SessionLogSnapshot {
  return {
    id: "log-1",
    loggedDate: FIXED_NOW,
    sportId: "sport-running",
    plannedSessionId: null,
    completion: "done",
    actualDurationMin: 45,
    actualLoadUnits: 60,
    plannedLoadUnits: 60,
    rpe: 5,
    freshness: 4,
    pain: "none",
    painZone: null,
    painAtRest: false,
    ...overrides,
  };
}

export function buildRiskFlag(overrides: Partial<RiskFlagSnapshot> = {}): RiskFlagSnapshot {
  return {
    flagType: "other",
    isActive: true,
    restrictions: {},
    ...overrides,
  };
}

export function buildPainEpisode(overrides: Partial<PainEpisodeSnapshot> = {}): PainEpisodeSnapshot {
  return {
    zone: "knee",
    level: "light",
    consecutiveSignals: 1,
    firstSignalOn: FIXED_NOW,
    lastSignalOn: FIXED_NOW,
    zoneBlocked: false,
    referralIssued: false,
    resolvedAt: null,
    ...overrides,
  };
}

export function buildWeekAggregate(overrides: Partial<WeekAggregateSnapshot> = {}): WeekAggregateSnapshot {
  return {
    weekStart: FIXED_NOW,
    completionRate: 0.9,
    avgRpe: 5,
    avgFreshness: 4,
    totalLoadUnits: 300,
    weightKg: 75,
    performanceTimeSec: null,
    energyAvg: 4,
    ...overrides,
  };
}

export function buildBodyMetric(overrides: Partial<BodyMetricSnapshot> = {}): BodyMetricSnapshot {
  return {
    measuredOn: FIXED_NOW,
    weightKg: 75,
    restingHr: 55,
    sleepHours: 7.5,
    hrvMs: 60,
    ...overrides,
  };
}

export function buildNutritionCheckin(overrides: Partial<NutritionCheckinSnapshot> = {}): NutritionCheckinSnapshot {
  return {
    date: FIXED_NOW,
    adherence: "high",
    energy: 4,
    ...overrides,
  };
}
