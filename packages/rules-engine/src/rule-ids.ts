/**
 * Identifiants de règles centralisés — évite les chaînes magiques dupliquées
 * entre le pipeline et ses tests. `RULE_VERSION` est une version de règle
 * uniforme pour ce lot (L2) ; elle progressera indépendamment du
 * `ruleset_version` (ADR-007 §1 : les deux notions sont distinctes) au fil
 * des évolutions de la logique métier elle-même.
 */

export const RULE_VERSION = "1" as const;

export const RULE_IDS = {
  riskBlockCalorieDeficit: "risk_restriction.block_calorie_deficit",
  riskMedicalClearance: "risk_restriction.medical_clearance",

  painLight: "pain_protocol.light",
  painPersistent: "pain_protocol.persistent",
  painAcute: "pain_protocol.acute",
  painNone: "pain_protocol.none",

  feasibility: "objective_feasibility.evaluate",

  macroBlock: "macro_blocks.block_created",
  deloadInserted: "guardrails.deload_inserted",

  weeklyLoadTarget: "progression.weekly_load_target",
  weeklyLoadCapApplied: "guardrails.weekly_progression_cap",
  weeklyLoadCapAppliedAcrossVersions: "guardrails.weekly_load_progression_cap_across_versions",
  coldStart: "guardrails.cold_start_volume_ratio",
  noIncreaseAsymmetry: "guardrails.no_increase_outside_review",
  noIncreaseActiveSignal: "guardrails.no_increase_active_signal",

  sportDistribution: "interference.sport_distribution",
  interferenceSpacing: "interference.spacing_adjustment",

  sessionBuilt: "sessions.session_built",
  painZoneExcluded: "sessions.pain_zone_excluded",
  restDayInserted: "guardrails.rest_day_inserted",
  intenseSessionCapApplied: "guardrails.max_intense_sessions_per_week",

  nutritionDay: "nutrition.day_target",
  nutritionFloorApplied: "nutrition.safety_floor_applied",
  nutritionRiskDeficitBlocked: "nutrition.risk_deficit_blocked",

  stagnationCalibration: "stagnation.calibration_insufficient_data",
  stagnationDiagnosis: "stagnation.diagnosis",

  objectiveEnd: "objective_end.offer",
} as const;
