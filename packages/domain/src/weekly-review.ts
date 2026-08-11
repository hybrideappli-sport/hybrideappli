/**
 * Contrats de la révision hebdomadaire (Lot L5 — AC5, ADR-005, ADR-011).
 * `08-architecture.md` §6.3 (`PlanDiffView`), §7 (séquence `runWeeklyReview()`).
 */

import type { PlanDiffItemKind } from "./enums";

// ---------------------------------------------------------------------------
// Forme persistée dans `plan_diffs.items` (jsonb)
// ---------------------------------------------------------------------------

/**
 * `PlanDiffItem` (`@hybride/rules-engine`, ADR-005 §4) enrichi de l'explication PAR ITEM
 * (`explanationId`), rendue et persistée une fois pour toutes à la création du diff (ADR-005 §4
 * « coût : générée une fois, pas à chaque affichage »). `decisionTraceIds` est réécrit pour
 * référencer les `decision_traces.id` RÉELLEMENT persistés (jamais les identifiants locaux au run
 * du moteur, `trace-N` — voir `runWeeklyReview()`).
 */
export interface StoredPlanDiffItem {
  kind: PlanDiffItemKind;
  scope: "week" | "day" | "block";
  targetDate: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  direction: "increase" | "decrease" | "neutral";
  decisionTraceIds: string[];
  explanationId: string | null;
}

// ---------------------------------------------------------------------------
// GET /plan/reviews/latest (AC5) — `08-architecture.md` §6.3
// ---------------------------------------------------------------------------

export interface PlanDiffItemView {
  kind: PlanDiffItemKind;
  scope: "week" | "day" | "block";
  targetDate: string | null;
  before: unknown;
  after: unknown;
  direction: "increase" | "decrease" | "neutral";
  explanation: { short: string; explanationId: string } | null;
}

export interface PlanDiffView {
  diffId: string;
  /** `null` = première semaine, cas explicite (ADR-005 §"négatives") — jamais laissé en erreur. */
  fromWeek: string | null;
  toWeek: string;
  summary: { short: string; long: string };
  items: PlanDiffItemView[];
  acknowledgedAt: string | null;
}

// ---------------------------------------------------------------------------
// POST /plan/reviews/:diffId/acknowledge
// ---------------------------------------------------------------------------

export interface AcknowledgeReviewResponse {
  acknowledgedAt: string;
}
