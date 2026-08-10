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

/** Schéma structurel complet — accepte les `null` (ruleset de développement). */
export const RulesetParamsSchema = z.object({
  guardrails: GuardrailsParamsSchema,
  interference: InterferenceParamsSchema,
  pain_protocol: PainProtocolParamsSchema,
  stagnation: StagnationParamsSchema,
  nutrition: NutritionParamsSchema,
  free_access: FreeAccessParamsSchema,
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

/**
 * Schéma "prêt pour la production" : structurellement identique à
 * `RulesetParamsSchema`, mais chaque paramètre de `guardrails` doit être un
 * nombre fini — plus aucun `null` toléré. C'est la porte qui doit rester
 * fermée tant que le fondateur n'a pas validé une valeur (ADR-007 §4,
 * `08-architecture.md` §9 : « refus de démarrage si un garde-fou est `null` »).
 *
 * Volontairement scopé à `guardrails` (et non à l'intégralité de `params`) :
 * c'est la formulation exacte d'ADR-007 (« un `null` sur un paramètre de
 * garde-fou »). Les autres catégories (`interference`, `pain_protocol`,
 * `nutrition`, une partie de `stagnation`) restent des questions ouvertes
 * produit distinctes (`08-architecture.md` §12) et ne bloquent pas, à elles
 * seules, l'activation d'un ruleset au sens de cette règle précise.
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
