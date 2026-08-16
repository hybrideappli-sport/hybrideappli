/**
 * `RulesetParamsSchema` — schéma Zod des paramètres de sécurité versionnés en
 * base (table `rulesets`, `docs/adr/ADR-007-parametres-securite-versionnes-en-base.md`).
 *
 * Deux niveaux de validation, volontairement distincts :
 *
 * 1. `RulesetParamsSchema` — la forme structurelle. Un paramètre peut valoir
 *    `null` (ruleset de développement, valeur "à trancher" — voir
 *    `docs/rulesets/0.1.0-dev.md`). C'est le schéma qui valide la colonne
 *    `rulesets.params` à l'insertion, quel que soit l'environnement.
 * 2. `ProductionRulesetParamsSchema` — un raffinement (`.superRefine`) qui
 *    **refuse tout `null` sur un paramètre de garde-fou** (`params.guardrails.*`).
 *    C'est la traduction directe d'ADR-007 §4 : « Les `null` sont volontaires
 *    et bloquants : le schéma Zod refuse une version publiée contenant un
 *    `null` sur un paramètre de garde-fou. » Cette validation est celle
 *    exécutée avant toute activation (`is_active = true`) d'un ruleset hors
 *    développement (ADR-007, `08-architecture.md` §9 : « refus de démarrage
 *    si un garde-fou est `null` »).
 *
 * Le moteur (`@hybride/rules-engine`) ne lit JAMAIS `rulesets` en base : il
 * reçoit un `Ruleset` déjà résolu en argument de `generatePlan(context, ruleset)`
 * (ADR-002 §1, ADR-007 §3). Ce fichier ne fait que typer/valider cette entrée.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Un nombre, ou `null` tant que la valeur n'a pas été tranchée (ADR-007). */
const nullableNumber = z.number().finite().nullable();

const GuardrailsParamsSchema = z.object({
  /** AC8 — plafond de progression hebdomadaire de VOLUME (%). */
  weekly_volume_progression_cap_pct: nullableNumber,
  /** AC8 — plafond de progression hebdomadaire de CHARGE composite (%). */
  weekly_load_progression_cap_pct: nullableNumber,
  /** AC8 — nombre max de séances intenses par semaine. */
  max_intense_sessions_per_week: nullableNumber,
  /** AC8 — décharge obligatoire tous les N blocs méso (non désactivable). */
  deload_every_n_blocks: nullableNumber,
  /** AC8 — réduction de volume appliquée lors d'une semaine de décharge (%). */
  deload_volume_reduction_pct: nullableNumber,
  /** AC8 — nombre max de jours consécutifs sans repos. */
  max_consecutive_days_without_rest: nullableNumber,
  /** AC1/AC12 — ratio du volume de démarrage "régime froid" / volume déclaré (< 1). */
  cold_start_volume_ratio: nullableNumber,
});
export type GuardrailsParams = z.infer<typeof GuardrailsParamsSchema>;

const InterferenceParamsSchema = z.object({
  /** AC10 — espacement minimal (heures) entre séance intense et force, mêmes groupes. */
  min_hours_between_intense_and_strength_same_groups: nullableNumber,
  global_load_distribution_strategy: z.enum(["by_priority", "equal"]).default("by_priority"),
});
export type InterferenceParams = z.infer<typeof InterferenceParamsSchema>;

const PainProtocolParamsSchema = z.object({
  /** AC9 — nombre de séances consécutives, même zone, déclenchant le niveau "persistent". */
  persistent_signal_threshold: nullableNumber,
  /** AC9 — fenêtre glissante (jours) dans laquelle ces signaux consécutifs comptent. */
  persistent_window_days: nullableNumber,
});
export type PainProtocolParams = z.infer<typeof PainProtocolParamsSchema>;

const StagnationParamsSchema = z.object({
  /** AC7 — fixé par la fiche : 4 semaines minimum avant tout diagnostic. */
  calibration_min_weeks: z.number().int().positive().default(4),
  /** AC6 — fixé par la fiche : fenêtre glissante de comparaison. */
  rolling_window_weeks: z.number().int().positive().default(4),
  /** AC6 — taux de complétion sous ce seuil ⟹ piste "inobservance". */
  nonadherence_completion_rate_threshold: nullableNumber,
  /** AC6 — tendance RPE au-delà de ce seuil ⟹ piste "surcharge". */
  overload_rpe_trend_threshold: nullableNumber,
});
export type StagnationParams = z.infer<typeof StagnationParamsSchema>;

const CarbModulationSchema = z.object({
  rest: nullableNumber,
  endurance: nullableNumber,
  intensity: nullableNumber,
});

const NutritionParamsSchema = z.object({
  /** AC11 — jamais de déficit calorique agressif : plafond de déficit journalier (%). */
  max_daily_deficit_pct: nullableNumber,
  /** AC11 — plancher de sécurité explicite (kcal/jour), sexe déclaré masculin. */
  absolute_kcal_floor_male: nullableNumber,
  /** AC11 — plancher de sécurité explicite (kcal/jour), sexe déclaré féminin. */
  absolute_kcal_floor_female: nullableNumber,
  /** g de protéines / kg de poids corporel, [min, max]. */
  protein_g_per_kg_range: z.tuple([nullableNumber, nullableNumber]),
  /** g de glucides / kg de poids corporel, modulés selon le type de séance du jour (AC11). */
  carb_modulation_by_session_type: CarbModulationSchema,
});
export type NutritionParams = z.infer<typeof NutritionParamsSchema>;

const FreeAccessParamsSchema = z.object({
  /** AC13 — nombre d'accès libres par période. */
  accesses_per_period: z.number().int().positive().default(3),
  /** ADR-008 — stratégie de fenêtre du compteur d'accès libre. */
  window_strategy: z.enum(["fixed_week", "rolling_7d"]).default("fixed_week"),
});
export type FreeAccessParams = z.infer<typeof FreeAccessParamsSchema>;

/**
 * US-02 — ADR-014 §1/§3 : formule du score hybride. Contrairement aux autres sections, AUCUN de
 * ces paramètres n'est un garde-fou de sécurité bloquant (`null` volontaire, ADR-007) : ce sont
 * des valeurs par défaut concrètes, une pondération mal calibrée dégrade un affichage, elle ne
 * blesse personne. La section entière est optionnelle et intégralement par défaut
 * (`.default({})`, cascadant sur chaque champ) pour que le ruleset `0.1.0-dev` de la F1, qui ne la
 * publie pas, reste valide au rejeu — ADR-014 §3.
 *
 * Valeurs par défaut = celles tranchées par le fondateur le 2026-08-12 (ADR-014, questions
 * ouvertes §1), reprises telles quelles dans la migration `0021_seed_data_sources.sql`
 * (`rulesets.version = '0.2.0-dev'`).
 */
const HybridScoreWeightsSchema = z.object({
  volume: z.number().finite().nonnegative().default(0.5),
  consistency: z.number().finite().nonnegative().default(0.3),
  diversity: z.number().finite().nonnegative().default(0.2),
});

const HybridScoreParamsSchema = z.object({
  weights: HybridScoreWeightsSchema.default({}),
  /** ADR-014 §1 — "≈ 10-12 h hebdomadaires d'entraînement mixte", calé sur les maquettes. */
  chronic_load_reference_units: z.number().finite().positive().default(700),
  /** ADR-014 §1 — 5 jours actifs par semaine. */
  target_active_days_per_28d: z.number().finite().positive().default(20),
  /** ADR-014 §1 — trois disciplines équilibrées = hybridité pleine (D = 1). */
  diversity_reference_disciplines: z.number().finite().positive().default(3),
  /** ADR-014 §2 — fenêtre d'AFFICHAGE (volume, delta), distincte de la fenêtre de calcul. */
  acute_window_days: z.number().int().positive().default(7),
  /** ADR-014 §2 — fenêtre de CALCUL du score (lisse les semaines de décharge imposées par AC8). */
  chronic_window_days: z.number().int().positive().default(28),
  /** ADR-014 §4 — paramètre PROPRE à l'AC8 du score, initialisé à la même valeur que
   * `stagnation.calibration_min_weeks` sans y être lié. */
  calibration_min_weeks: z.number().int().positive().default(4),
  /** ADR-014 §4 — "quatre semaines écoulées avec deux séances ne sont pas des données comparables". */
  min_sessions_for_score: z.number().int().positive().default(4),
});
export type HybridScoreParams = z.infer<typeof HybridScoreParamsSchema>;

/**
 * US-03 — ADR-016 §4 : granularité horaire (grille de 30 min, bornes de créneau, préférences
 * d'affichage) et paramètres de replacement (marge de blocage d'un imprévu, préavis minimal,
 * densité journalière). Comme `hybrid_score` ci-dessus, AUCUN de ces paramètres n'est un
 * garde-fou bloquant au sens d'ADR-007 §4 (le pire cas est une annulation perçue comme
 * arbitraire, jamais une mise en danger) — **à l'exception des trois paramètres de densité
 * journalière** (`max_sessions_per_day`, `min_minutes_between_sessions_same_day`,
 * `allow_two_intense_sessions_same_day`), marqués `to_validate` dans `source_refs`
 * (`supabase/migrations/0025_seed_planning_ruleset.sql`) : ils touchent à la sécurité (AC8) sans
 * être eux-mêmes un `guardrails.*`, à confirmer avant un ruleset `1.0.0` (ADR-016, question
 * ouverte n°1). Section entière optionnelle et intégralement par défaut (`.default({})`), pour
 * que `0.1.0-dev`/`0.2.0-dev`, qui ne la publient pas, restent valides au rejeu.
 *
 * `incident_soft_limit_per_week` reste `number | null` — `null` = "aucune limite appliquée",
 * état par défaut tant que la question produit §7 de la fiche US-03 (`08-architecture.md` §12
 * question 16) n'est pas tranchée par le fondateur. Ce `null` n'est PAS de la même famille que
 * les `null` bloquants d'ADR-007 §4 : il ne vit jamais dans `params.guardrails`, et
 * `ProductionRulesetParamsSchema` ne le contraint donc jamais.
 */
const SlotWindowSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Heure 'HH:MM' attendue."),
  end: z.string().regex(/^\d{2}:\d{2}$/, "Heure 'HH:MM' attendue."),
});

const SlotWindowsSchema = z.object({
  am: SlotWindowSchema.default({ start: "06:30", end: "11:30" }),
  pm: SlotWindowSchema.default({ start: "16:30", end: "21:30" }),
  unspecified: SlotWindowSchema.default({ start: "06:30", end: "21:30" }),
});

const PreferredStartTimesSchema = z.object({
  am: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default(["07:00", "06:30", "08:00", "09:00"]),
  pm: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default(["18:30", "19:00", "17:30", "20:00"]),
  unspecified: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default(["18:30", "07:00", "12:30"]),
});

const PlanningParamsSchema = z.object({
  slot_windows: SlotWindowsSchema.default({}),
  /** ADR-016 §4 — sous-créneaux fixes, ni le minute-près ni le choix libre. */
  grid_minutes: z.number().int().positive().default(30),
  preferred_start_times: PreferredStartTimesSchema.default({}),
  /** Si `availability_slots.max_minutes` est `null`. */
  default_slot_capacity_min: z.number().int().positive().default(120),
  /** Jamais un replacement « dans 10 minutes » (ADR-016 §7). */
  min_lead_time_min: z.number().int().nonnegative().default(60),
  /** `to_validate` — densité journalière, touche AC8 sans être un `guardrails.*`. */
  min_minutes_between_sessions_same_day: nullableNumber.default(360),
  max_sessions_per_day: nullableNumber.default(2),
  allow_two_intense_sessions_same_day: z.boolean().default(false),
  /** Largeur de la fenêtre neutralisée par un imprévu, de part et d'autre du créneau occupé. */
  incident_block_margin_min: z.number().int().nonnegative().default(120),
  /** AC4 — jamais de report cumulatif : corollaire technique direct. */
  reschedule_scope: z.literal("current_week").default("current_week"),
  /** ADR-017 §1 — fenêtre de grâce avant l'écriture du `not_done` automatique. */
  closeout_local_hour: z.number().int().min(0).max(23).default(3),
  /** Question produit NON tranchée (fiche §7) — `null` = aucune limite appliquée. */
  incident_soft_limit_per_week: nullableNumber.default(null),
});
export type PlanningParams = z.infer<typeof PlanningParamsSchema>;

/** Schéma structurel complet — accepte les `null` (ruleset de développement). */
export const RulesetParamsSchema = z.object({
  guardrails: GuardrailsParamsSchema,
  interference: InterferenceParamsSchema,
  pain_protocol: PainProtocolParamsSchema,
  stagnation: StagnationParamsSchema,
  nutrition: NutritionParamsSchema,
  free_access: FreeAccessParamsSchema,
  hybrid_score: HybridScoreParamsSchema.default({}),
  planning: PlanningParamsSchema.default({}),
});
export type RulesetParams = z.infer<typeof RulesetParamsSchema>;

// ---------------------------------------------------------------------------
// Contrôle "production" — refus des `null` sur les garde-fous
// ---------------------------------------------------------------------------

/** Chemins `params.guardrails.*` dont la valeur est un garde-fou dur AC8/AC12. */
const GUARDRAIL_PARAM_KEYS = [
  "weekly_volume_progression_cap_pct",
  "weekly_load_progression_cap_pct",
  "max_intense_sessions_per_week",
  "deload_every_n_blocks",
  "deload_volume_reduction_pct",
  "max_consecutive_days_without_rest",
  "cold_start_volume_ratio",
] as const satisfies readonly (keyof GuardrailsParams)[];

/** Chemins `params.pain_protocol.*` — AC9, protocole douleur (machine à états, orientation santé). */
const PAIN_PROTOCOL_PARAM_KEYS = [
  "persistent_signal_threshold",
  "persistent_window_days",
] as const satisfies readonly (keyof PainProtocolParams)[];

/** Chemins scalaires `params.nutrition.*` — AC11, plancher de sécurité et plafond de déficit. */
const NUTRITION_SCALAR_PARAM_KEYS = [
  "max_daily_deficit_pct",
  "absolute_kcal_floor_male",
  "absolute_kcal_floor_female",
] as const satisfies readonly (keyof Omit<NutritionParams, "protein_g_per_kg_range" | "carb_modulation_by_session_type">)[];

/**
 * Schéma "prêt pour la production" : structurellement identique à
 * `RulesetParamsSchema`, mais chaque paramètre de sécurité (`guardrails.*`,
 * `pain_protocol.*`, `nutrition.*`) doit être un nombre fini — plus aucun
 * `null` toléré. C'est la porte qui doit rester fermée tant que le fondateur
 * n'a pas validé une valeur (ADR-007 §4, `08-architecture.md` §9 : « refus de
 * démarrage si un garde-fou est `null` »).
 *
 * Étendu au-delà de `guardrails` (revue post-Lot L5, finding B3) : un `null`
 * sur `pain_protocol.persistent_signal_threshold` fait lever
 * `evaluatePainProtocol()` en 500 opaque plutôt que de refuser proprement le
 * démarrage — AC9 (protocole douleur) est un garde-fou de sécurité utilisateur
 * au même titre qu'`AC8`, même s'il ne porte pas le préfixe `guardrails.`.
 * Idem pour `nutrition.*` (AC11 — jamais de déficit calorique agressif, plancher
 * de sécurité explicite). `interference.*` et le reste de `stagnation.*`
 * restent volontairement hors de ce schéma : ce sont des questions ouvertes
 * produit (`08-architecture.md` §12) dont l'absence de valeur ne met
 * personne en danger (au pire, aucun espacement supplémentaire n'est imposé).
 */
export const ProductionRulesetParamsSchema = RulesetParamsSchema.superRefine((params, ctx) => {
  for (const key of GUARDRAIL_PARAM_KEYS) {
    if (params.guardrails[key] === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardrails", key],
        message: `guardrails.${key} ne peut pas être null pour un ruleset publié en production (ADR-007 §4).`,
      });
    }
  }
  for (const key of PAIN_PROTOCOL_PARAM_KEYS) {
    if (params.pain_protocol[key] === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pain_protocol", key],
        message: `pain_protocol.${key} ne peut pas être null pour un ruleset publié en production (AC9, garde-fou de sécurité).`,
      });
    }
  }
  for (const key of NUTRITION_SCALAR_PARAM_KEYS) {
    if (params.nutrition[key] === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nutrition", key],
        message: `nutrition.${key} ne peut pas être null pour un ruleset publié en production (AC11, garde-fou de sécurité).`,
      });
    }
  }
  params.nutrition.protein_g_per_kg_range.forEach((value, index) => {
    if (value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nutrition", "protein_g_per_kg_range", index],
        message: "nutrition.protein_g_per_kg_range ne peut pas contenir de null pour un ruleset publié en production (AC11).",
      });
    }
  });
  (Object.keys(params.nutrition.carb_modulation_by_session_type) as Array<keyof typeof params.nutrition.carb_modulation_by_session_type>).forEach(
    (key) => {
      if (params.nutrition.carb_modulation_by_session_type[key] === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nutrition", "carb_modulation_by_session_type", key],
          message: `nutrition.carb_modulation_by_session_type.${key} ne peut pas être null pour un ruleset publié en production (AC11).`,
        });
      }
    },
  );
});

/** `true` si `params` peut être activé (`is_active = true`) en production. */
export function isProductionReady(params: RulesetParams): boolean {
  return ProductionRulesetParamsSchema.safeParse(params).success;
}

// ---------------------------------------------------------------------------
// `Ruleset` — ce que reçoit réellement `generatePlan(context, ruleset)`
// ---------------------------------------------------------------------------

export const SOURCE_CONFIDENCE_LEVELS = ["validated", "to_validate"] as const;
export type SourceConfidence = (typeof SOURCE_CONFIDENCE_LEVELS)[number];

export interface RulesetSourceRef {
  value_ref: string;
  sources: string[];
  confidence: SourceConfidence;
  last_reviewed: string;
  note?: string;
}

/**
 * Vue minimale de la ligne `rulesets` nécessaire au moteur — un sous-ensemble
 * délibéré de la table (ADR-007) : `is_active`, `published_by`, etc.
 * n'intéressent que la couche d'orchestration, jamais le moteur pur.
 */
export interface Ruleset {
  version: string;
  params: RulesetParams;
  sourceRefs?: Record<string, RulesetSourceRef>;
}

export const RulesetSchema = z.object({
  version: z.string().min(1),
  params: RulesetParamsSchema,
  sourceRefs: z.record(z.string(), z.any()).optional(),
}) satisfies z.ZodType<Ruleset, z.ZodTypeDef, unknown>;
