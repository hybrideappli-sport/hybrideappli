/**
 * Contrats de l'onboarding conversationnel (Lot L3 — AC1, AC2, AC3).
 * `08-architecture.md` §6.1-6.2, `plans/US-01-coach-ia-personnalise.md` §6 (étapes 15-20).
 *
 * Deux schémas de profil, volontairement distincts :
 *
 * - `ProfileDraftSchema` — le brouillon accumulé au fil de la conversation, dans
 *   `onboarding_sessions.profile_draft` (jsonb). Entièrement optionnel : à tout instant du chat, la
 *   plupart des champs peuvent être encore inconnus. C'est le patch produit par le LLM (ADR-002 §2,
 *   « Onboarding conversationnel ») qui est validé PAR CE SCHÉMA avant d'être fusionné dans le
 *   brouillon — jamais persisté tel quel sans ce filtre Zod.
 * - `ConfirmedProfileSchema` — strict, complet, exigé par `POST /onboarding/session/:id/complete`.
 *   C'est ce que l'utilisateur VALIDE explicitement sur l'écran récap (AC1 : « il valide son profil
 *   initial ») ; le LLM n'a jamais l'autorité de le persister seul.
 */

import { z } from "zod";

import { CONSENT_CODES, EXPERIENCE_LEVELS, RISK_FLAG_TYPES } from "./enums";
import type { NutritionCheckinSummary, SessionLogSummary } from "./session-log";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date ISO attendue (YYYY-MM-DD).");

/**
 * `sports.code` — référentiel PARTAGÉ entre tous les utilisateurs (`sports_read … using (true)`,
 * `docs/db-schema.md` §2). `resolveOrCreateSport()` (`apps/web/lib/orchestration/resolve-sport.ts`)
 * y insère un sport non documenté (`is_documented = false`) dès que le code déclaré n'existe pas
 * encore — sans borne, un client pouvait y faire créer un nombre non borné de lignes de contenu
 * arbitraire visibles par tous (finding I10, revue post-Lot L5). Bornage aligné sur les codes
 * existants (`0010_seed_referentials.sql` : `running`, `trail_running`, `strength_training`, …) :
 * minuscules, chiffres, tiret et underscore, 40 caractères maximum. `resolveOrCreateSport()`
 * applique la MÊME contrainte indépendamment de ce schéma (défense en profondeur, ADR-012).
 */
export const SPORT_CODE_PATTERN = /^[a-z0-9_-]+$/;
export const SportCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => value.toLowerCase())
  .refine((value) => SPORT_CODE_PATTERN.test(value), {
    message: "Code de sport invalide — attendu : minuscules, chiffres, '-' ou '_' uniquement (max 40 caractères).",
  });

export const ConfirmedSportSchema = z.object({
  sportCode: SportCodeSchema,
  level: z.enum(EXPERIENCE_LEVELS),
  weeklySessionsDeclared: z.number().int().min(0).max(21).nullable().default(null),
  yearsPractice: z.number().min(0).max(80).nullable().default(null),
  isPrimary: z.boolean().default(false),
  priority: z.number().int().min(1).max(10).default(1),
});
export type ConfirmedSport = z.infer<typeof ConfirmedSportSchema>;

export const ConfirmedAvailabilitySlotSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  slot: z.enum(["am", "pm", "unspecified"]).default("unspecified"),
  maxMinutes: z.number().int().min(0).max(600).nullable().default(null),
  isAvailable: z.boolean().default(true),
});
export type ConfirmedAvailabilitySlot = z.infer<typeof ConfirmedAvailabilitySlotSchema>;

/**
 * AC3 — question filtre profils à risque. `notes` reste en clair ici (transport applicatif) ;
 * c'est la route `/complete` qui le chiffre (`risk_flags.notes_enc`, pgcrypto — ADR-010 §5) avant
 * écriture, jamais ce schéma de contrat.
 */
export const ConfirmedRiskFlagSchema = z.object({
  flagType: z.enum(RISK_FLAG_TYPES),
  notes: z.string().max(2000).optional(),
});
export type ConfirmedRiskFlag = z.infer<typeof ConfirmedRiskFlagSchema>;

export const ObjectiveKindSchema = z.enum(["race", "performance", "body_composition", "general_fitness"]);

export const ConfirmedObjectiveSchema = z.object({
  sportCode: SportCodeSchema.nullable().default(null),
  kind: ObjectiveKindSchema,
  label: z.string().min(1).max(200),
  targetDate: isoDate.nullable().default(null),
  /**
   * `targetWeeklyHours` est le seul champ lu par `evaluateObjectiveFeasibility` (AC2) au Lot L2 —
   * voir `packages/rules-engine/src/objective-feasibility.ts`. Le reste est libre (jsonb côté
   * moteur/base) pour ne pas figer un barème par discipline non tranché (question ouverte n°6).
   */
  targetMetric: z.record(z.string(), z.unknown()).default({}),
});
export type ConfirmedObjective = z.infer<typeof ConfirmedObjectiveSchema>;

// ---------------------------------------------------------------------------
// ProfileDraftSchema — brouillon conversationnel, tout optionnel
// ---------------------------------------------------------------------------

export const ProfileDraftSchema = z
  .object({
    birthDate: isoDate.nullable(),
    sexAtBirth: z.enum(["male", "female"]).nullable(),
    heightCm: z.number().min(50).max(260).nullable(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS),
    trainingYears: z.number().min(0).max(80).nullable(),
    declaredWeeklySessions: z.number().int().min(0).max(21).nullable(),
    declaredWeeklyHours: z.number().min(0).max(40).nullable(),
    trainingHistory: z.record(z.string(), z.unknown()),
    nutritionHabits: z.record(z.string(), z.unknown()),
    dietaryConstraints: z.array(z.string()),
    sports: z.array(ConfirmedSportSchema),
    availability: z.array(ConfirmedAvailabilitySlotSchema),
    objective: ConfirmedObjectiveSchema,
    riskFlags: z.array(ConfirmedRiskFlagSchema),
  })
  .partial();
export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;

/** Patch produit par le LLM à un tour de conversation — un sous-ensemble encore plus permissif. */
export const ProfileDraftPatchSchema = ProfileDraftSchema.partial();
export type ProfileDraftPatch = z.infer<typeof ProfileDraftPatchSchema>;

// ---------------------------------------------------------------------------
// ConfirmedProfileSchema — strict, exigé à `/complete`
// ---------------------------------------------------------------------------

export const ConfirmedProfileSchema = z.object({
  birthDate: isoDate.nullable().default(null),
  sexAtBirth: z.enum(["male", "female"]).nullable().default(null),
  heightCm: z.number().min(50).max(260).nullable().default(null),
  experienceLevel: z.enum(EXPERIENCE_LEVELS),
  trainingYears: z.number().min(0).max(80).nullable().default(null),
  declaredWeeklySessions: z.number().int().min(0).max(21).nullable().default(null),
  declaredWeeklyHours: z.number().min(0).max(40).nullable().default(null),
  trainingHistory: z.record(z.string(), z.unknown()).default({}),
  nutritionHabits: z.record(z.string(), z.unknown()).default({}),
  dietaryConstraints: z.array(z.string()).default([]),
  sports: z.array(ConfirmedSportSchema).min(1, "Au moins un sport pratiqué est requis (fiche §1)."),
  availability: z.array(ConfirmedAvailabilitySlotSchema).default([]),
  objective: ConfirmedObjectiveSchema,
  riskFlags: z.array(ConfirmedRiskFlagSchema).default([]),
});
export type ConfirmedProfile = z.infer<typeof ConfirmedProfileSchema>;

// ---------------------------------------------------------------------------
// Entrées des routes (08-architecture.md §6.1)
// ---------------------------------------------------------------------------

export const OnboardingMessageInputSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});
export type OnboardingMessageInput = z.infer<typeof OnboardingMessageInputSchema>;

export const DisclaimerAckInputSchema = z.object({
  documentVersion: z.string().min(1),
});
export type DisclaimerAckInput = z.infer<typeof DisclaimerAckInputSchema>;

export const ConsentInputSchema = z.object({
  code: z.enum(CONSENT_CODES),
  granted: z.boolean(),
});
export type ConsentInput = z.infer<typeof ConsentInputSchema>;

export const NegotiationDecisionSchema = z.object({
  decision: z.enum(["accept_proposal", "keep_original"]),
  proposalId: z.string().min(1).optional(),
});
export type NegotiationDecision = z.infer<typeof NegotiationDecisionSchema>;

// ---------------------------------------------------------------------------
// Sorties (vues stables, réutilisées par apps/web)
// ---------------------------------------------------------------------------

export interface OnboardingMessageView {
  id: string;
  role: "coach" | "user" | "system";
  content: string;
  step: string | null;
  isReformulation: boolean;
  createdAt: string;
}

export interface OnboardingSessionView {
  sessionId: string;
  status: string;
  step: string;
  profileDraft: ProfileDraft;
  messages: OnboardingMessageView[];
}

export interface ExplanationView {
  short: string;
  explanationId: string;
}

export interface TodaySessionView {
  id: string;
  sportCode: string | null;
  sessionType: string;
  durationMin: number | null;
  loadUnits: number;
  intensityZone: string | null;
  prescription: { warmup: string; body: string; cooldown: string } | null;
  interferenceNote: string | null;
  explanation: ExplanationView;
  /**
   * AC4 — saisie déjà enregistrée pour cette séance, `null` si Thomas ne l'a pas encore renseignée.
   * Toujours `null` juste après une génération de plan (Lot L3, `materializePlanVersion()`) : le
   * réalisé n'existe qu'après passage par `POST /session-logs` (Lot L4).
   */
  log: SessionLogSummary | null;
}

export interface TodayNutritionView {
  kcalTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  modulationReason: string;
  advice: { pre: string; during: string; post: string };
  explanation: ExplanationView;
  /** AC4, AC11 — check-in déjà enregistré pour ce jour, `null` sinon (voir `log` ci-dessus). */
  checkin: NutritionCheckinSummary | null;
}

export interface TodayPlanView {
  date: string;
  session: TodaySessionView | null;
  nutrition: TodayNutritionView | null;
}

export interface FeasibilityProposalView {
  id: string;
  kind: "intermediate_objective" | "adjusted_deadline";
  label: string;
  targetDate: string;
  rationale: string;
}

export type CompleteOnboardingResponse =
  | {
      outcome: "plan_generated";
      planVersionId: string;
      today: TodayPlanView;
    }
  | {
      outcome: "objective_negotiation";
      objectiveId: string;
      feasibility: "unrealistic";
      reasoning: { short: string; long: string; decisionTraceIds: string[] };
      proposals: FeasibilityProposalView[];
      canKeepOriginal: true;
    };

export type NegotiationResponse = {
  planVersionId: string;
  today: TodayPlanView;
};
