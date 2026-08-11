/**
 * `PlanDraft` — la sortie calculée par `generatePlan()`, avant persistance.
 *
 * Reflète le modèle multi-échelle d'ADR-004 (macro / méso / micro) et la
 * matérialisation asymétrique selon l'horizon : détail complet J → J+7,
 * intention J+8 → J+14, vue macro par blocs au-delà (AC1).
 */

import type { BlockType, DetailLevel, MuscleGroup, NutritionModulationReason, SessionType } from "./enums";

export interface PlanBlockDraft {
  blockIndex: number;
  blockType: BlockType;
  startDate: string; // ISO date
  endDate: string; // ISO date
  focus: string | null;
  targetLoadUnits: number;
  /** `DecisionTrace.id` (locaux au run) qui justifient ce bloc — voir `diffPlanVersions`. */
  traceIds: string[];
}

export interface PlanWeekDraft {
  weekStart: string; // ISO date, lundi
  isoWeek: string; // '2026-W32'
  blockIndex: number;
  detailLevel: DetailLevel;
  isDeload: boolean;
  targetLoadUnits: number;
  plannedIntenseSessions: number;
  maxConsecutiveDaysWithoutRest: number;
  /** `DecisionTrace.id` (locaux au run) qui justifient la cible de cette semaine. */
  traceIds: string[];
}

export interface SessionPrescription {
  warmup: string;
  body: string;
  cooldown: string;
}

export interface PlannedSessionDraft {
  scheduledDate: string; // ISO date
  slot: "am" | "pm" | "unspecified";
  orderInDay: number;
  sportCode: string | null;
  sessionType: SessionType;
  detailLevel: DetailLevel; // 'detailed' | 'intent' — jamais 'macro' à ce niveau
  durationMin: number | null;
  loadUnits: number;
  intensityZone: string | null;
  prescription: SessionPrescription | null; // null si detail_level = 'intent'
  muscleGroups: MuscleGroup[];
  interferenceNote: string | null; // AC10
  isIntense: boolean;
  /** `DecisionTrace.id` (locaux au run) qui justifient cette séance — voir `diffPlanVersions`. */
  traceIds: string[];
}

export interface NutritionDayDraft {
  date: string; // ISO date
  modulationReason: NutritionModulationReason;
  kcalTarget: number;
  kcalSafetyFloor: number; // AC11 — kcalTarget >= kcalSafetyFloor, toujours
  proteinG: number;
  carbsG: number;
  fatG: number;
  hydrationMl: number | null;
  advicePre: string;
  adviceDuring: string;
  advicePost: string;
  /** `DecisionTrace.id` (locaux au run) qui justifient cette journée nutrition. */
  traceIds: string[];
}

export interface PlanDraft {
  objectiveId: string;
  startedOn: string; // ISO date — = context.now
  horizonStart: string;
  horizonEnd: string;
  blocks: PlanBlockDraft[];
  weeks: PlanWeekDraft[];
  /** Uniquement J → J+14 (ADR-004 §3) : au-delà, seuls `blocks`/`weeks(detail_level='macro')` existent. */
  sessions: PlannedSessionDraft[];
  /** Uniquement la semaine détaillée J → J+7 (AC11). */
  nutritionDays: NutritionDayDraft[];
}

/**
 * `PlanSnapshot` — un plan déjà calculé, tel que persisté dans
 * `plan_versions.snapshot` (ADR-004 §2). Structurellement identique à
 * `PlanDraft` : c'est le même objet, avant (`PlanDraft`) ou après (`PlanSnapshot`)
 * son passage en base. Utilisé comme `context.previousPlan` (continuité,
 * asymétrie AC4) et comme entrée de `diffPlanVersions()` (AC5).
 */
export type PlanSnapshot = PlanDraft;
