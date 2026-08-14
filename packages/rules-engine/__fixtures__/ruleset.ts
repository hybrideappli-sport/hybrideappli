/**
 * Fixture `Ruleset` pour les tests de `@hybride/rules-engine`.
 *
 * `@hybride/rules-engine` doit rester à ZÉRO dépendance réseau/base, y
 * compris dans ses tests (ADR-002, ADR-003) : on ne se connecte donc jamais
 * à Supabase pour charger le ruleset `0.1.0-dev` réel. Cette fixture est
 * construite EN DUR à partir de deux sources canoniques :
 *
 *  - les 6 valeurs de `guardrails` (AC8) sont recopiées À L'IDENTIQUE de
 *    `docs/rulesets/0.1.0-dev.md` et de `supabase/migrations/0010_seed_referentials.sql`
 *    (validées par le fondateur le 2026-08-06) — voir `GUARDRAILS_0_1_0_DEV`
 *    ci-dessous, qui DOIT rester synchronisé avec ces deux fichiers ;
 *  - les autres catégories (`interference`, `pain_protocol`, `stagnation`
 *    au-delà des deux fenêtres déjà fixées par AC6/AC7, `nutrition`) sont
 *    encore `null` dans le ruleset réel (non tranchées par le fondateur —
 *    `docs/adr/ADR-007-parametres-securite-versionnes-en-base.md` §"Question
 *    ouverte relayée au fondateur"). Le moteur a besoin de valeurs
 *    concrètes pour exécuter les étapes 2, 8, 10 du pipeline : `developer`
 *    leur donne ici des valeurs PROVISOIRES, documentées comme telles
 *    (`confidence: 'to_validate'`), UNIQUEMENT pour permettre au moteur de
 *    tourner en test. Ce ne sont PAS des valeurs validées par le fondateur
 *    au même titre que les 6 garde-fous AC8 — voir le rapport de fin de lot
 *    de `developer` pour le détail de cette décision et son statut de
 *    question ouverte.
 */

import type { Ruleset } from "@hybride/domain";

/** Recopié À L'IDENTIQUE de `docs/rulesets/0.1.0-dev.md` — validé par le fondateur le 2026-08-06. */
export const GUARDRAILS_0_1_0_DEV = {
  weekly_volume_progression_cap_pct: 10,
  weekly_load_progression_cap_pct: 10,
  max_intense_sessions_per_week: 2,
  deload_every_n_blocks: 1,
  deload_volume_reduction_pct: 45,
  max_consecutive_days_without_rest: 6,
  // Seule valeur de `guardrails` qui reste `null` dans le ruleset réel (hors périmètre de la
  // note du 2026-08-06, `docs/rulesets/0.1.0-dev.md` §Avertissement). Valeur provisoire ici
  // uniquement pour permettre le calcul du régime froid (AC1/AC12) en test.
  cold_start_volume_ratio: 0.7,
} as const;

/**
 * Ruleset complet pour les tests. `version` distincte de `'0.1.0-dev'` pour
 * ne jamais laisser croire qu'il s'agit du ruleset réellement publié en
 * base — c'est une fixture de `developer`, pas un export du seed SQL.
 */
export const TEST_RULESET: Ruleset = {
  version: "0.1.0-dev-test-fixture",
  params: {
    guardrails: { ...GUARDRAILS_0_1_0_DEV },
    interference: {
      // Provisoire — voir l'en-tête de fichier. Borne basse documentée par
      // `docs/rulesets/0.1.0-dev.md` §3 elle-même ("48 à 72h de récupération").
      min_hours_between_intense_and_strength_same_groups: 48,
      global_load_distribution_strategy: "by_priority",
    },
    pain_protocol: {
      // Provisoire — voir l'en-tête de fichier.
      persistent_signal_threshold: 3,
      persistent_window_days: 14,
    },
    stagnation: {
      calibration_min_weeks: 4, // fixé par AC6/AC7, pas une valeur ouverte
      rolling_window_weeks: 4, // fixé par AC6, pas une valeur ouverte
      // Provisoire — voir l'en-tête de fichier.
      nonadherence_completion_rate_threshold: 0.6,
      overload_rpe_trend_threshold: 1.5,
    },
    nutrition: {
      // Provisoire — voir l'en-tête de fichier.
      max_daily_deficit_pct: 20,
      absolute_kcal_floor_male: 1500,
      absolute_kcal_floor_female: 1200,
      protein_g_per_kg_range: [1.6, 2.2],
      carb_modulation_by_session_type: { rest: 2.5, endurance: 4, intensity: 6 },
    },
    free_access: {
      accesses_per_period: 3,
      window_strategy: "fixed_week",
    },
    // US-02 — ADR-014 §1, valeurs tranchées par le fondateur le 2026-08-12 (contrairement aux
    // sections ci-dessus, CE ne sont PAS des placeholders provisoires : recopiées à l'identique de
    // `supabase/migrations/0021_seed_data_sources.sql` / ruleset `0.2.0-dev`).
    hybrid_score: {
      weights: { volume: 0.5, consistency: 0.3, diversity: 0.2 },
      chronic_load_reference_units: 700,
      target_active_days_per_28d: 20,
      diversity_reference_disciplines: 3,
      acute_window_days: 7,
      chronic_window_days: 28,
      calibration_min_weeks: 4,
      min_sessions_for_score: 4,
    },
  },
  sourceRefs: {
    "guardrails.weekly_volume_progression_cap_pct": {
      value_ref: "params.guardrails.weekly_volume_progression_cap_pct",
      sources: ["docs/rulesets/0.1.0-dev.md"],
      confidence: "validated",
      last_reviewed: "2026-08-06",
    },
  },
};
