/**
 * Contrats de la boucle quotidienne (Lot L4 — AC4, AC7, AC9, AC11, AC13).
 * `08-architecture.md` §6.3-6.5, `plans/US-01-coach-ia-personnalise.md` §6 (étapes 21-26).
 *
 * Réutilise `TodaySessionView`/`TodayNutritionView`/`ExplanationView` (`onboarding.ts`, Lot L3) :
 * la forme d'une séance/journée nutrition du jour est IDENTIQUE, qu'elle sorte de la génération
 * initiale du plan ou d'une lecture `/plan/today` — seuls `activePainNotice` et `entitlement`
 * (propres à la lecture quotidienne, jamais calculés à la génération) s'ajoutent au niveau racine.
 */

import { z } from "zod";

import { ADHERENCE_LEVELS, BODY_ZONES, COMPLETION_STATUSES, PAIN_LEVELS } from "./enums";
import type { BodyZone, PainProtocolLevel } from "./enums";
import type { ExplanationView, TodayNutritionView, TodaySessionView } from "./onboarding";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date ISO attendue (YYYY-MM-DD).");

// ---------------------------------------------------------------------------
// Vues partagées
// ---------------------------------------------------------------------------

/** AC9 — jamais derrière le paywall (ADR-008 §5) : niveaux 2 et 3 uniquement. */
export interface PainNoticeView {
  zone: BodyZone;
  level: Extract<PainProtocolLevel, "persistent" | "acute">;
  message: string;
}

/**
 * AC3 — profil à risque (`pathology`/`minor`, `resolveRiskRestrictions()` côté moteur,
 * `requiresMedicalClearance`). Comme `PainNoticeView` : jamais derrière le paywall, un message
 * d'orientation vers un professionnel de santé ne peut pas dépendre d'un abonnement.
 */
export interface MedicalClearanceNoticeView {
  message: string;
}

export interface FreeAccessView {
  used: number;
  remaining: number;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  resetsAt: string; // ISO date
}

/** AC13 — pilote l'UI, ne l'autorise jamais seul (l'autorité est `requireEntitlement()` serveur). */
export interface EntitlementView {
  tier: "free" | "premium";
  canViewToday: boolean;
  canViewWeek: boolean;
  canViewMacro: boolean;
  freeAccess: FreeAccessView;
}

// ---------------------------------------------------------------------------
// GET /plan/today (AC1, AC9, AC11, AC13)
// ---------------------------------------------------------------------------

export interface TodayPlanResponse {
  date: string; // ISO date
  session: TodaySessionView | null; // null = jour de repos (état vide, `04-flow.md`)
  nutrition: TodayNutritionView | null;
  activePainNotice: PainNoticeView | null;
  medicalClearanceNotice: MedicalClearanceNoticeView | null;
  entitlement: EntitlementView;
}

// ---------------------------------------------------------------------------
// POST /session-logs (AC4, AC9)
// ---------------------------------------------------------------------------

/**
 * `painAtRest` — question CONDITIONNELLE, affichée côté client uniquement si `pain = 'pain'`
 * (fiche AC4, R7 du plan). Le schéma ne la rend pas obligatoire (un client honnête ne l'envoie que
 * dans ce cas) ; `evaluatePainProtocol` (Lot L2) traite son absence comme `false`.
 */
export const CreateSessionLogInputSchema = z
  .object({
    plannedSessionId: z.string().uuid().nullable().default(null),
    loggedDate: isoDate,
    completion: z.enum(COMPLETION_STATUSES),
    notDoneReason: z.string().max(500).optional(),
    actualDurationMin: z.number().int().min(0).max(1440).optional(),
    rpe: z.number().int().min(1).max(10).optional(),
    freshness: z.number().int().min(1).max(5).optional(),
    pain: z.enum(PAIN_LEVELS),
    painZone: z.enum(BODY_ZONES).optional(),
    painAtRest: z.boolean().optional(),
    comment: z.string().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.pain !== "none" && !value.painZone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["painZone"],
        message: "La localisation de la gêne/douleur est requise dès que `pain` n'est pas 'none'.",
      });
    }
  });
export type CreateSessionLogInput = z.infer<typeof CreateSessionLogInputSchema>;

export interface CreateSessionLogResponse {
  logId: string;
  adjustment: {
    applied: boolean;
    /** JAMAIS 'increase' ici — AC4, invariant ADR-005 §5. */
    direction: "decrease" | "none";
    planVersionId: string | null;
    affectedDates: string[];
    explanation: ExplanationView | null;
  };
  painProtocol: {
    level: PainProtocolLevel;
    zoneBlocked: boolean;
    referral: { required: boolean; message: string } | null;
  };
  nextSession: TodaySessionView | null;
}

// ---------------------------------------------------------------------------
// POST /nutrition-checkins (AC4, AC11) — saisie légère uniquement, pas de carnet détaillé.
// ---------------------------------------------------------------------------

export const NutritionCheckinInputSchema = z.object({
  date: isoDate,
  adherence: z.enum(ADHERENCE_LEVELS),
  energy: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});
export type NutritionCheckinInput = z.infer<typeof NutritionCheckinInputSchema>;

export interface NutritionCheckinResponse {
  checkinId: string;
}

// ---------------------------------------------------------------------------
// GET /explanations/:id (AC1, AC5) — lecture seule, jamais de génération à la volée.
// ---------------------------------------------------------------------------

export interface ExplanationTraceSummary {
  ruleId: string;
  category: string;
  conditionExpr: string;
  output: { field: string; before: unknown; after: unknown; direction: string };
}

export interface ExplanationDetailView {
  short: string;
  long: string | null;
  confidence: string;
  traces?: ExplanationTraceSummary[];
}

// ---------------------------------------------------------------------------
// GET /progress/diagnosis (AC6, AC7)
// ---------------------------------------------------------------------------

export interface IndicatorTrend {
  label: string;
  current: number;
  previous: number;
}

export type ProgressDiagnosisResponse =
  | {
      /** AC7 — sortie NOMINALE, pas une erreur. */
      status: "calibration";
      weeksAvailable: number;
      weeksRequired: number;
      message: string;
      confidence: "calibrating";
    }
  | { status: "no_stagnation"; indicators: IndicatorTrend[]; explanation: ExplanationDetailView }
  | {
      /** AC6 */
      status: "stagnation";
      indicator: string;
      diagnosis: string;
      evidence: IndicatorTrend[];
      proposedAdaptation: { summary: string; planVersionId: string | null };
      explanation: ExplanationDetailView;
    };
