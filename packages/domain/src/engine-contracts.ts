/**
 * Contrats des fonctions exportées par `@hybride/rules-engine`
 * (`08-architecture.md` §4.1).
 */

import type {
  BodyZone,
  ConfidenceLevel,
  FeasibilityStatus,
  FreeAccessWindowStrategy,
  PainProtocolLevel,
  PlanDiffItemKind,
  StagnationDiagnosis,
  StagnationStatus,
} from "./enums.js";
import type { DecisionTrace, GuardrailHit } from "./decision-trace.js";
import type { PlanDraft, PlanSnapshot } from "./plan-draft.js";

// ---------------------------------------------------------------------------
// generatePlan()
// ---------------------------------------------------------------------------

export interface EngineResult {
  plan: PlanDraft;
  traces: DecisionTrace[];
  guardrailsApplied: GuardrailHit[];
  /** AC7 — sortie nominale, pas un cas d'erreur (ADR-006 §2). */
  confidence: Extract<ConfidenceLevel, "high" | "calibrating">;
}

// ---------------------------------------------------------------------------
// evaluateObjectiveFeasibility() — AC2
// ---------------------------------------------------------------------------

export interface FeasibilityProposal {
  id: string;
  kind: "intermediate_objective" | "adjusted_deadline";
  label: string;
  targetDate: string; // ISO date
  targetMetric: Record<string, unknown>;
  rationale: string;
}

export interface FeasibilityResult {
  status: FeasibilityStatus;
  trace: DecisionTrace;
  /** Non vide si `status = 'unrealistic'` — AC2 : jamais de plan silencieux. */
  proposals: FeasibilityProposal[];
}

// ---------------------------------------------------------------------------
// evaluateStagnation() — AC6, AC7
// ---------------------------------------------------------------------------

export interface StagnationEvidenceItem {
  label: string;
  current: number;
  previous: number;
}

export type StagnationRecommendedAction =
  | "increase_load"
  | "vary_stimulus"
  | "deload"
  | "adjust_to_real_life"
  | "none";

export interface StagnationResult {
  status: StagnationStatus;
  weeksAvailable: number;
  weeksRequired: number;
  indicator: "time" | "load" | "weight" | "energy" | null;
  diagnosis: StagnationDiagnosis | null;
  evidence: StagnationEvidenceItem[];
  /** AC6 — ne vaut JAMAIS 'increase_load' quand `diagnosis = 'nonadherence'`. */
  recommendedAction: StagnationRecommendedAction | null;
  confidence: ConfidenceLevel;
  trace: DecisionTrace;
}

// ---------------------------------------------------------------------------
// evaluatePainProtocol() — AC9
// ---------------------------------------------------------------------------

export interface PainZoneState {
  zone: BodyZone;
  level: PainProtocolLevel;
  consecutiveSignals: number;
  /** true pour 'persistent' (pause) et 'acute' (arrêt total). */
  zoneBlocked: boolean;
  /** true pour 'persistent' et 'acute' — orientation professionnel de santé. */
  referralRequired: boolean;
  /**
   * AC9 niveau 3 : "sans proposer d'alternative d'auto-adaptation". `false`
   * uniquement pour `level = 'acute'`.
   */
  autoAdaptationAllowed: boolean;
  trace: DecisionTrace;
}

export interface PainProtocolResult {
  zoneStates: PainZoneState[];
}

// ---------------------------------------------------------------------------
// diffPlanVersions() — AC5
// ---------------------------------------------------------------------------

export interface PlanDiffItem {
  kind: PlanDiffItemKind;
  scope: "week" | "day" | "block";
  targetDate: string | null; // ISO date
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  direction: "increase" | "decrease" | "neutral";
  decisionTraceIds: string[];
}

export interface PlanDiff {
  fromWeek: string | null; // null = première semaine (ADR-005 §"cas explicite")
  toWeek: string;
  items: PlanDiffItem[];
}

// ---------------------------------------------------------------------------
// evaluateFreeAccess() — AC13, ADR-008
// ---------------------------------------------------------------------------

export interface FreeAccessEvent {
  accessedOn: string; // ISO date, fuseau utilisateur
}

export interface FreeAccessParamsInput {
  accessesPerPeriod: number;
  windowStrategy: FreeAccessWindowStrategy;
}

export interface FreeAccessResult {
  allowed: boolean;
  used: number;
  remaining: number;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  resetsAt: string; // ISO date
}

export type { PlanSnapshot };
