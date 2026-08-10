/**
 * `PlanningContext` — le snapshot complet et auto-suffisant reçu par le
 * moteur (`08-architecture.md` §4.1, ADR-002, ADR-005 §2).
 *
 * Règle absolue (ADR-002) : **aucun champ de ce type n'est jamais résolu par
 * le moteur lui-même**. `now`, l'aléa éventuel, l'historique, tout est
 * injecté par l'appelant (couche d'orchestration `apps/web`, ou un test).
 * `@hybride/rules-engine` ne lit jamais l'horloge système, jamais la base,
 * jamais le réseau.
 */

import type {
  AdherenceLevel,
  BodyZone,
  CompletionStatus,
  DataRegime,
  ExperienceLevel,
  FeasibilityStatus,
  MuscleGroup,
  ObjectiveStatus,
  PainLevel,
  PainProtocolLevel,
  PlanTrigger,
  RiskFlagType,
} from "./enums.js";
import type { PlanSnapshot } from "./plan-draft.js";

export interface AthleteProfileSnapshot {
  userId: string;
  birthDate: string | null; // ISO date — AC3, détection mineur
  sexAtBirth: "male" | "female" | null; // AC11, planchers caloriques
  heightCm: number | null;
  experienceLevel: ExperienceLevel;
  trainingYears: number | null;
  declaredWeeklySessions: number | null;
  declaredWeeklyHours: number | null;
  dietaryConstraints: string[];
}

export interface AthleteSportSnapshot {
  sportId: string;
  code: string;
  family: "endurance" | "strength" | "mixed" | "skill";
  defaultMuscleGroups: MuscleGroup[];
  isDocumented: boolean; // question ouverte n°7 — sport rare/non documenté
  level: ExperienceLevel;
  priority: number; // AC10 — arbitrage d'interférence, 1 = priorité la plus haute
  weeklySessionsDeclared: number | null;
  isPrimary: boolean;
}

export interface ObjectiveSnapshot {
  id: string;
  sportId: string | null;
  kind: "race" | "performance" | "body_composition" | "general_fitness";
  targetDate: string | null; // ISO date
  targetMetric: Record<string, unknown>;
  status: ObjectiveStatus;
  feasibility: FeasibilityStatus | null;
}

export interface RiskFlagSnapshot {
  flagType: RiskFlagType;
  isActive: boolean;
  restrictions: Record<string, unknown>;
}

export interface AvailabilitySnapshot {
  weekday: number; // 1-7, ISO (1 = lundi)
  slot: "am" | "pm" | "unspecified";
  maxMinutes: number | null;
  isAvailable: boolean;
}

export interface SessionLogSnapshot {
  id: string;
  loggedDate: string; // ISO date
  sportId: string | null;
  plannedSessionId: string | null;
  completion: CompletionStatus;
  actualDurationMin: number | null;
  actualLoadUnits: number | null;
  plannedLoadUnits: number | null; // pour comparer réalisé/prévu (AC6 inobservance)
  rpe: number | null; // 1-10
  freshness: number | null; // 1-5
  pain: PainLevel;
  painZone: BodyZone | null;
  painAtRest: boolean; // AC9 niveau 3
}

export interface NutritionCheckinSnapshot {
  date: string; // ISO date
  adherence: AdherenceLevel;
  energy: number; // 1-5
}

export interface BodyMetricSnapshot {
  measuredOn: string; // ISO date
  weightKg: number | null;
  restingHr: number | null;
  sleepHours: number | null;
  hrvMs: number | null;
}

/** Agrégat hebdomadaire déjà comparable, consommé par `evaluateStagnation` (AC6/AC7). */
export interface WeekAggregateSnapshot {
  weekStart: string; // ISO date, lundi
  completionRate: number; // 0-1
  avgRpe: number | null;
  avgFreshness: number | null;
  totalLoadUnits: number;
  weightKg: number | null;
  performanceTimeSec: number | null; // indicateur "time" (ex. temps sur distance repère)
  energyAvg: number | null;
}

/** État de la machine à états douleur (AC9), tel qu'il existe déjà en base. */
export interface PainEpisodeSnapshot {
  zone: BodyZone;
  level: PainProtocolLevel;
  consecutiveSignals: number;
  firstSignalOn: string; // ISO date
  lastSignalOn: string; // ISO date
  zoneBlocked: boolean;
  referralIssued: boolean;
  resolvedAt: string | null; // ISO datetime, null = épisode ouvert
}

export interface PlanningContext {
  /** Date de référence — JAMAIS lue depuis l'horloge système (ADR-002). ISO date (YYYY-MM-DD). */
  now: string;
  timezone: string;
  /** Déclencheur de cette génération — pilote l'asymétrie hausse/baisse (AC4, ADR-005 §5). */
  trigger: PlanTrigger;
  profile: AthleteProfileSnapshot;
  sports: AthleteSportSnapshot[];
  objective: ObjectiveSnapshot;
  riskFlags: RiskFlagSnapshot[];
  availability: AvailabilitySnapshot[];
  history: {
    /** Fenêtre glissante ≥ 8 semaines (`08-architecture.md` §4.1). */
    sessionLogs: SessionLogSnapshot[];
    nutritionCheckins: NutritionCheckinSnapshot[];
    bodyMetrics: BodyMetricSnapshot[];
    completedWeeks: WeekAggregateSnapshot[];
  };
  painEpisodes: PainEpisodeSnapshot[];
  previousPlan: PlanSnapshot | null;
  dataRegime: DataRegime;
}
