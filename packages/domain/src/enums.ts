/**
 * Enums partagés — recopiés à l'identique des `create type ... as enum (...)`
 * de `docs/db-schema.md` §0.2 (DDL canonique). Toute divergence entre ce
 * fichier et le schéma SQL est un bug : les deux DOIVENT rester alignés.
 *
 * Regroupés ici plutôt qu'éclatés par domaine pour n'avoir qu'un seul
 * endroit à comparer au DDL lors d'une revue.
 */

export const BODY_ZONES = [
  "knee",
  "ankle",
  "foot",
  "hip",
  "lower_back",
  "upper_back",
  "shoulder",
  "elbow",
  "wrist",
  "neck",
  "thigh",
  "calf",
  "chest",
  "other",
] as const;
export type BodyZone = (typeof BODY_ZONES)[number];

export const MUSCLE_GROUPS = [
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "back",
  "chest",
  "shoulders",
  "arms",
  "full_body",
  "none",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const SESSION_TYPES = [
  "endurance",
  "tempo",
  "interval",
  "long",
  "strength",
  "power",
  "mobility",
  "technique",
  "cross_training",
  "rest",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/** Types de séance considérés "intenses" pour le plafond AC8 (`max_intense_sessions_per_week`). */
export const INTENSE_SESSION_TYPES: readonly SessionType[] = ["tempo", "interval", "power"];

export const DAY_SLOTS = ["am", "pm", "unspecified"] as const;
export type DaySlot = (typeof DAY_SLOTS)[number];

export const COMPLETION_STATUSES = ["done", "partial", "not_done"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const PAIN_LEVELS = ["none", "light", "pain"] as const;
export type PainLevel = (typeof PAIN_LEVELS)[number];

export const PAIN_PROTOCOL_LEVELS = ["none", "light", "persistent", "acute"] as const;
export type PainProtocolLevel = (typeof PAIN_PROTOCOL_LEVELS)[number];

export const ADHERENCE_LEVELS = ["low", "partial", "high"] as const;
export type AdherenceLevel = (typeof ADHERENCE_LEVELS)[number];

export const DATA_SOURCES = ["declared", "connected"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const DATA_REGIMES = ["cold", "declared", "connected"] as const;
export type DataRegime = (typeof DATA_REGIMES)[number];

export const CONFIDENCE_LEVELS = ["high", "calibrating", "unknown"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const STAGNATION_DIAGNOSES = [
  "understimulation",
  "overload",
  "nonadherence",
  "inconclusive",
] as const;
export type StagnationDiagnosis = (typeof STAGNATION_DIAGNOSES)[number];

export const STAGNATION_STATUSES = ["calibration", "no_stagnation", "stagnation"] as const;
export type StagnationStatus = (typeof STAGNATION_STATUSES)[number];

export const FEASIBILITY_STATUSES = ["realistic", "stretch", "unrealistic"] as const;
export type FeasibilityStatus = (typeof FEASIBILITY_STATUSES)[number];

export const BLOCK_TYPES = ["base", "build", "specific", "taper", "transition", "recovery"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const DETAIL_LEVELS = ["detailed", "intent", "macro"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export const PLAN_TRIGGERS = [
  "onboarding",
  "objective_renegotiation",
  "negative_signal",
  "pain_protocol",
  "weekly_review",
  "stagnation",
  "objective_end",
  "manual_admin",
  // US-02 — ADR-014 §5/§6 : réutilise `engine_runs.trigger` pour l'auditabilité de
  // `computeHybridScore()`, comme `pain_protocol` le fait déjà pour `evaluatePainProtocol()`. Ne
  // déclenche AUCUNE génération de plan (`TRIGGERS_ALLOWING_INCREASE` ne le liste pas).
  "hybrid_score",
] as const;
export type PlanTrigger = (typeof PLAN_TRIGGERS)[number];

/**
 * Déclencheurs qui autorisent une hausse de charge (`direction = 'increase'`).
 *
 * Décision de `developer` (Lot L2) : `08-architecture.md` §4.3 et
 * `docs/adr/ADR-005-versioning-plan-et-diff-materialise.md` §5 autorisent
 * explicitement DEUX déclencheurs (`weekly_review` ET `objective_renegotiation`),
 * cohérent avec l'AC2 (négocier un objectif plus ambitieux doit pouvoir relever
 * la charge cible). `07-spec-feature1-coach-ia.md` (AC4) et `plans/US-01-...md`
 * §4.1 ne mentionnent que `weekly_review` dans leur formulation courte, mais ne
 * traitent pas du cas de la renégociation d'objectif — ce n'est pas une
 * contradiction, seulement une formulation elliptique côté AC4 (qui ne parle
 * que de la boucle quotidienne). Retenu : la liste la plus complète et la plus
 * documentée (deux ADR + le corps de `08-architecture.md`). Voir le rapport
 * de `developer` pour le détail de cet arbitrage.
 */
export const TRIGGERS_ALLOWING_INCREASE: readonly PlanTrigger[] = [
  "weekly_review",
  "objective_renegotiation",
];

export const OBJECTIVE_STATUSES = [
  "draft",
  "active",
  "renegotiated",
  "achieved",
  "expired",
  "abandoned",
] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const RISK_FLAG_TYPES = [
  "minor",
  "pregnancy",
  "pathology",
  "eating_disorder_history",
  "other",
] as const;
export type RiskFlagType = (typeof RISK_FLAG_TYPES)[number];

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DECISION_TRACE_CATEGORIES = [
  "guardrail",
  "progression",
  "interference",
  "nutrition",
  "pain",
  "stagnation",
  "feasibility",
  "risk_restriction",
  "calibration",
  // US-02 — ADR-014 : `computeHybridScore()` produit sa propre trace, hors pipeline (§6 de l'ADR).
  "hybrid_score",
] as const;
export type DecisionTraceCategory = (typeof DECISION_TRACE_CATEGORIES)[number];

export const DECISION_TRACE_SCOPES = [
  "plan",
  "block",
  "week",
  "session",
  "nutrition_day",
  "objective",
  "pain_zone",
  // US-02 — ADR-014 : le score hybride n'est rattaché à aucun plan/objectif, seulement à une
  // fenêtre glissante de séances réalisées.
  "hybrid_score",
] as const;
export type DecisionTraceScope = (typeof DECISION_TRACE_SCOPES)[number];

export const TRACE_DIRECTIONS = ["increase", "decrease", "neutral"] as const;
export type TraceDirection = (typeof TRACE_DIRECTIONS)[number];

export const TRACE_SEVERITIES = ["info", "warning", "critical"] as const;
export type TraceSeverity = (typeof TRACE_SEVERITIES)[number];

export const PLAN_DIFF_ITEM_KINDS = [
  "session_added",
  "session_removed",
  "session_modified",
  "week_load_changed",
  "block_changed",
  "nutrition_target_changed",
  "deload_inserted",
  "zone_paused",
] as const;
export type PlanDiffItemKind = (typeof PLAN_DIFF_ITEM_KINDS)[number];

export const NUTRITION_MODULATION_REASONS = ["rest", "endurance", "intensity"] as const;
export type NutritionModulationReason = (typeof NUTRITION_MODULATION_REASONS)[number];

export const FREE_ACCESS_WINDOW_STRATEGIES = ["fixed_week", "rolling_7d"] as const;
export type FreeAccessWindowStrategy = (typeof FREE_ACCESS_WINDOW_STRATEGIES)[number];

/** `onboarding_step` — `docs/db-schema.md` §3. Ordre imposé du parcours (Lot L3). */
export const ONBOARDING_STEPS = [
  "intro",
  "goal",
  "level",
  "history",
  "sports",
  "availability",
  "nutrition",
  "risk_filter",
  "disclaimer",
  "health_consent",
  "review",
  "completed",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Étapes menées en conversation libre (chat). `disclaimer`, `health_consent` et `review` sont des
 * écrans DÉDIÉS et bloquants (AC3, notes UX fiche §6, ADR-010 §3) — jamais posés comme une
 * question de plus dans le fil de discussion.
 */
export const ONBOARDING_CHAT_STEPS: readonly OnboardingStep[] = [
  "intro",
  "goal",
  "level",
  "history",
  "sports",
  "availability",
  "nutrition",
  "risk_filter",
];

/** `consent_documents.code` / `consents.document_code` — ADR-010 §1. */
// US-02, ADR-013 §5 — consentement dédié à l'import de données depuis une source tierce (Strava),
// distinct de `health_data_processing` : le traitement change (transfert vers/depuis un tiers,
// jeton d'accès permanent), pas seulement la catégorie de données.
export const CONSENT_CODES = ["medical_disclaimer", "health_data_processing", "terms", "privacy", "third_party_data_import"] as const;
export type ConsentCode = (typeof CONSENT_CODES)[number];
