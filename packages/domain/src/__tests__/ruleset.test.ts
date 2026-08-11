/**
 * `RulesetParamsSchema` / `ProductionRulesetParamsSchema` — ADR-007.
 *
 * Vérifie que le schéma structurel accepte le ruleset `0.1.0-dev` tel que
 * réellement seedé (`supabase/migrations/0010_seed_referentials.sql`,
 * garde-fous AC8 validés + reste encore `null`), et que le schéma de
 * production refuse tout `null` sur `params.guardrails.*`.
 */

import { describe, expect, it } from "vitest";
import { ProductionRulesetParamsSchema, RulesetParamsSchema, isProductionReady } from "../ruleset.js";

/** Reproduit exactement `params` tel qu'inséré par la migration 0010 (ruleset `0.1.0-dev`). */
const SEEDED_0_1_0_DEV_PARAMS = {
  guardrails: {
    weekly_volume_progression_cap_pct: 10,
    weekly_load_progression_cap_pct: 10,
    max_intense_sessions_per_week: 2,
    deload_every_n_blocks: 1,
    deload_volume_reduction_pct: 45,
    max_consecutive_days_without_rest: 6,
    cold_start_volume_ratio: null,
  },
  interference: {
    min_hours_between_intense_and_strength_same_groups: null,
    global_load_distribution_strategy: "by_priority",
  },
  pain_protocol: {
    persistent_signal_threshold: null,
    persistent_window_days: null,
  },
  stagnation: {
    calibration_min_weeks: 4,
    rolling_window_weeks: 4,
    nonadherence_completion_rate_threshold: null,
    overload_rpe_trend_threshold: null,
  },
  nutrition: {
    max_daily_deficit_pct: null,
    absolute_kcal_floor_male: null,
    absolute_kcal_floor_female: null,
    protein_g_per_kg_range: [null, null],
    carb_modulation_by_session_type: { rest: null, endurance: null, intensity: null },
  },
  free_access: {
    accesses_per_period: 3,
    window_strategy: "fixed_week",
  },
};

describe("RulesetParamsSchema", () => {
  it("accepte le ruleset 0.1.0-dev réellement seedé (garde-fous AC8 renseignés, reste encore null)", () => {
    const result = RulesetParamsSchema.safeParse(SEEDED_0_1_0_DEV_PARAMS);
    expect(result.success).toBe(true);
  });

  it("refuse une structure incomplète (catégorie manquante)", () => {
    const { guardrails } = SEEDED_0_1_0_DEV_PARAMS;
    const result = RulesetParamsSchema.safeParse({ guardrails });
    expect(result.success).toBe(false);
  });
});

/** Ruleset complet — tous les paramètres de sécurité (`guardrails`, `pain_protocol`, `nutrition`) renseignés. */
const FULLY_RESOLVED_PARAMS = {
  ...SEEDED_0_1_0_DEV_PARAMS,
  guardrails: { ...SEEDED_0_1_0_DEV_PARAMS.guardrails, cold_start_volume_ratio: 0.7 },
  pain_protocol: { persistent_signal_threshold: 3, persistent_window_days: 14 },
  nutrition: {
    max_daily_deficit_pct: 20,
    absolute_kcal_floor_male: 1500,
    absolute_kcal_floor_female: 1200,
    protein_g_per_kg_range: [1.2, 2.2] as [number, number],
    carb_modulation_by_session_type: { rest: 2, endurance: 4, intensity: 6 },
  },
};

describe("ProductionRulesetParamsSchema — ADR-007 §4, finding B3 (extension pain_protocol/nutrition)", () => {
  it("refuse le ruleset 0.1.0-dev réellement seedé pour la production (cold_start_volume_ratio, pain_protocol, nutrition sont null)", () => {
    const result = ProductionRulesetParamsSchema.safeParse(SEEDED_0_1_0_DEV_PARAMS);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("guardrails.cold_start_volume_ratio");
      expect(paths).toContain("pain_protocol.persistent_signal_threshold");
      expect(paths).toContain("nutrition.max_daily_deficit_pct");
    }
  });

  it("accepte un ruleset dont TOUS les paramètres de sécurité (guardrails, pain_protocol, nutrition) sont renseignés", () => {
    const result = ProductionRulesetParamsSchema.safeParse(FULLY_RESOLVED_PARAMS);
    expect(result.success).toBe(true);
  });

  it("isProductionReady() reflète ce même verdict", () => {
    const parsed = RulesetParamsSchema.parse(SEEDED_0_1_0_DEV_PARAMS);
    expect(isProductionReady(parsed)).toBe(false);

    const complete = RulesetParamsSchema.parse(FULLY_RESOLVED_PARAMS);
    expect(isProductionReady(complete)).toBe(true);
  });

  it("reste bloquant même si un seul garde-fou AC8 est null (pas seulement cold_start_volume_ratio)", () => {
    const almostComplete = {
      ...FULLY_RESOLVED_PARAMS,
      guardrails: { ...FULLY_RESOLVED_PARAMS.guardrails, max_intense_sessions_per_week: null },
    };
    const result = ProductionRulesetParamsSchema.safeParse(almostComplete);
    expect(result.success).toBe(false);
  });

  it("reste bloquant si pain_protocol.* est null alors que guardrails est complet (AC9)", () => {
    const missingPainProtocol = {
      ...FULLY_RESOLVED_PARAMS,
      pain_protocol: { persistent_signal_threshold: null, persistent_window_days: 14 },
    };
    const result = ProductionRulesetParamsSchema.safeParse(missingPainProtocol);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("pain_protocol.persistent_signal_threshold");
    }
  });

  it("reste bloquant si un paramètre nutrition imbriqué (protein_g_per_kg_range, carb_modulation) est null (AC11)", () => {
    const missingNutritionNested = {
      ...FULLY_RESOLVED_PARAMS,
      nutrition: {
        ...FULLY_RESOLVED_PARAMS.nutrition,
        protein_g_per_kg_range: [1.2, null] as [number, number | null],
        carb_modulation_by_session_type: { ...FULLY_RESOLVED_PARAMS.nutrition.carb_modulation_by_session_type, rest: null },
      },
    };
    const result = ProductionRulesetParamsSchema.safeParse(missingNutritionNested);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("nutrition.protein_g_per_kg_range.1");
      expect(paths).toContain("nutrition.carb_modulation_by_session_type.rest");
    }
  });
});
