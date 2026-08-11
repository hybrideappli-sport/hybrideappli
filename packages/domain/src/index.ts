/**
 * @hybride/domain
 *
 * Point de vérité unique des contrats partagés entre l'application web, le
 * moteur à règles et le service LLM : enums, `PlanningContext`, `PlanDraft`,
 * `DecisionTrace`, `RulesetParamsSchema` (Zod), contrats des fonctions du
 * moteur. Voir `08-architecture.md` §2 (arborescence), ADR-003.
 *
 * Ce package ne dépend d'aucun autre package du monorepo.
 *
 * Réexports NOMMÉS explicites (valeurs séparées des types), volontairement PAS `export * from`
 * (Lot L3, `developer`) : le bundler de `apps/web` (Next 16 / Turbopack) échoue à résoudre les
 * réexports `export *` d'IDENTIFIANTS DE VALEUR (schémas Zod, constantes `as const`, fonctions) à
 * travers ce barrel — `next build` remontait « Export X doesn't exist in target module » pour
 * `RulesetSchema`, `ONBOARDING_CHAT_STEPS`, `OnboardingMessageInputSchema`, etc., alors que `tsc
 * --noEmit` validait le même code sans erreur (défaut connu des barrels sous Turbopack : son
 * analyse statique des réexports en étoile ne suit pas la réécriture d'extension `.js` → `.ts`
 * imposée par `moduleResolution: "Bundler"` de ce monorepo). `@hybride/rules-engine` et
 * `@hybride/coach-llm` n'étaient jamais tombés dans ce piège : leurs barrels utilisaient déjà des
 * réexports nommés explicites — ce fichier s'aligne sur le même style, désormais partout.
 */

export const DOMAIN_PACKAGE_NAME = "@hybride/domain" as const;

// ---------------------------------------------------------------------------
// enums.ts
// ---------------------------------------------------------------------------

export {
  BODY_ZONES,
  MUSCLE_GROUPS,
  SESSION_TYPES,
  INTENSE_SESSION_TYPES,
  DAY_SLOTS,
  COMPLETION_STATUSES,
  PAIN_LEVELS,
  PAIN_PROTOCOL_LEVELS,
  ADHERENCE_LEVELS,
  DATA_SOURCES,
  DATA_REGIMES,
  CONFIDENCE_LEVELS,
  STAGNATION_DIAGNOSES,
  STAGNATION_STATUSES,
  FEASIBILITY_STATUSES,
  BLOCK_TYPES,
  DETAIL_LEVELS,
  PLAN_TRIGGERS,
  TRIGGERS_ALLOWING_INCREASE,
  OBJECTIVE_STATUSES,
  RISK_FLAG_TYPES,
  EXPERIENCE_LEVELS,
  DECISION_TRACE_CATEGORIES,
  DECISION_TRACE_SCOPES,
  TRACE_DIRECTIONS,
  TRACE_SEVERITIES,
  PLAN_DIFF_ITEM_KINDS,
  NUTRITION_MODULATION_REASONS,
  FREE_ACCESS_WINDOW_STRATEGIES,
  ONBOARDING_STEPS,
  ONBOARDING_CHAT_STEPS,
  CONSENT_CODES,
} from "./enums";
export type {
  BodyZone,
  MuscleGroup,
  SessionType,
  DaySlot,
  CompletionStatus,
  PainLevel,
  PainProtocolLevel,
  AdherenceLevel,
  DataSource,
  DataRegime,
  ConfidenceLevel,
  StagnationDiagnosis,
  StagnationStatus,
  FeasibilityStatus,
  BlockType,
  DetailLevel,
  PlanTrigger,
  ObjectiveStatus,
  RiskFlagType,
  ExperienceLevel,
  DecisionTraceCategory,
  DecisionTraceScope,
  TraceDirection,
  TraceSeverity,
  PlanDiffItemKind,
  NutritionModulationReason,
  FreeAccessWindowStrategy,
  OnboardingStep,
  ConsentCode,
} from "./enums";

// ---------------------------------------------------------------------------
// ruleset.ts
// ---------------------------------------------------------------------------

export { RulesetParamsSchema, ProductionRulesetParamsSchema, isProductionReady, SOURCE_CONFIDENCE_LEVELS, RulesetSchema } from "./ruleset";
export type {
  GuardrailsParams,
  InterferenceParams,
  PainProtocolParams,
  StagnationParams,
  NutritionParams,
  FreeAccessParams,
  RulesetParams,
  SourceConfidence,
  RulesetSourceRef,
  Ruleset,
} from "./ruleset";

// ---------------------------------------------------------------------------
// planning-context.ts — uniquement des types
// ---------------------------------------------------------------------------

export type {
  AthleteProfileSnapshot,
  AthleteSportSnapshot,
  ObjectiveSnapshot,
  RiskFlagSnapshot,
  AvailabilitySnapshot,
  SessionLogSnapshot,
  NutritionCheckinSnapshot,
  BodyMetricSnapshot,
  WeekAggregateSnapshot,
  PainEpisodeSnapshot,
  PlanningContext,
} from "./planning-context";

// ---------------------------------------------------------------------------
// plan-draft.ts — uniquement des types
// ---------------------------------------------------------------------------

export type {
  PlanBlockDraft,
  PlanWeekDraft,
  SessionPrescription,
  PlannedSessionDraft,
  NutritionDayDraft,
  PlanDraft,
  PlanSnapshot,
} from "./plan-draft";

// ---------------------------------------------------------------------------
// decision-trace.ts — uniquement des types
// ---------------------------------------------------------------------------

export type { TraceInput, TraceOutput, DecisionTrace, RuleOutput, GuardrailHit } from "./decision-trace";

// ---------------------------------------------------------------------------
// engine-contracts.ts — uniquement des types (PlanSnapshot déjà réexporté ci-dessus, via plan-draft.js)
// ---------------------------------------------------------------------------

export type {
  EngineResult,
  FeasibilityProposal,
  FeasibilityResult,
  StagnationEvidenceItem,
  StagnationRecommendedAction,
  StagnationResult,
  PainZoneState,
  PainProtocolResult,
  PlanDiffItem,
  PlanDiff,
  FreeAccessEvent,
  FreeAccessParamsInput,
  FreeAccessResult,
} from "./engine-contracts";

// ---------------------------------------------------------------------------
// onboarding.ts
// ---------------------------------------------------------------------------

export {
  SPORT_CODE_PATTERN,
  SportCodeSchema,
  ConfirmedSportSchema,
  ConfirmedAvailabilitySlotSchema,
  ConfirmedRiskFlagSchema,
  ObjectiveKindSchema,
  ConfirmedObjectiveSchema,
  ProfileDraftSchema,
  ProfileDraftPatchSchema,
  ConfirmedProfileSchema,
  OnboardingMessageInputSchema,
  DisclaimerAckInputSchema,
  ConsentInputSchema,
  NegotiationDecisionSchema,
} from "./onboarding";
export type {
  ConfirmedSport,
  ConfirmedAvailabilitySlot,
  ConfirmedRiskFlag,
  ConfirmedObjective,
  ProfileDraft,
  ProfileDraftPatch,
  ConfirmedProfile,
  OnboardingMessageInput,
  DisclaimerAckInput,
  ConsentInput,
  NegotiationDecision,
  OnboardingMessageView,
  OnboardingSessionView,
  ExplanationView,
  TodaySessionView,
  TodayNutritionView,
  TodayPlanView,
  FeasibilityProposalView,
  CompleteOnboardingResponse,
  NegotiationResponse,
} from "./onboarding";

// ---------------------------------------------------------------------------
// session-log.ts — uniquement des types
// ---------------------------------------------------------------------------

export type { SessionLogSummary, NutritionCheckinSummary } from "./session-log";

// ---------------------------------------------------------------------------
// today-plan.ts — boucle quotidienne (Lot L4)
// ---------------------------------------------------------------------------

export { CreateSessionLogInputSchema, NutritionCheckinInputSchema } from "./today-plan";
export type {
  PainNoticeView,
  FreeAccessView,
  EntitlementView,
  TodayPlanResponse,
  CreateSessionLogInput,
  CreateSessionLogResponse,
  NutritionCheckinInput,
  NutritionCheckinResponse,
  ExplanationTraceSummary,
  ExplanationDetailView,
  IndicatorTrend,
  ProgressDiagnosisResponse,
} from "./today-plan";

// ---------------------------------------------------------------------------
// weekly-review.ts — révision hebdomadaire (Lot L5, AC5)
// ---------------------------------------------------------------------------

export type {
  StoredPlanDiffItem,
  PlanDiffItemView,
  PlanDiffView,
  AcknowledgeReviewResponse,
} from "./weekly-review";

// ---------------------------------------------------------------------------
// notifications.ts (Lot L5, AC5 R8)
// ---------------------------------------------------------------------------

export type {
  NotificationView,
  NotificationsListResponse,
  MarkNotificationReadResponse,
} from "./notifications";

// ---------------------------------------------------------------------------
// billing.ts — Stripe (Lot L5, AC13, ADR-009)
// ---------------------------------------------------------------------------

export type {
  BillingOfferResponse,
  SubscriptionIntentResponse,
  InvoiceView,
  InvoicesResponse,
} from "./billing";

// ---------------------------------------------------------------------------
// objective-end.ts (Lot L5, AC14)
// ---------------------------------------------------------------------------

export type { ObjectiveEndProposalView, ObjectiveEndResponse } from "./objective-end";

// ---------------------------------------------------------------------------
// push.ts (Lot L5, ADR-011 §5)
// ---------------------------------------------------------------------------

export { PushSubscriptionInputSchema } from "./push";
export type { PushSubscriptionInput, PushSubscriptionResponse } from "./push";
