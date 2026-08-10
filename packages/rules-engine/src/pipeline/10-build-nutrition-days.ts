/**
 * Étape 10 — `buildNutritionDays` (AC11).
 *
 * Cibles caloriques et macros modulées à la séance du jour (repos /
 * endurance / intensité), avec plancher de sécurité toujours respecté
 * (`kcal_target >= kcal_safety_floor`) et déficit jamais agressif. Généré
 * uniquement pour la semaine détaillée J → J+6 (AC1, AC11).
 */

import type { DecisionTrace, NutritionDayDraft, NutritionModulationReason, PlannedSessionDraft, PlanningContext, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids.js";
import type { TraceFactory } from "../lib/trace.js";
import { requireNonNull } from "../lib/require-non-null.js";
import type { RiskRestrictions } from "./01-resolve-risk-restrictions.js";

const DEFAULT_WEIGHT_KG = 70;
/** kcal / kg de poids corporel / jour — heuristique de maintenance documentée de `developer`. */
const MAINTENANCE_KCAL_PER_KG = 31;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;
const MIN_FAT_G_PER_KG = 0.5;

function modulationReasonForSession(session: PlannedSessionDraft | undefined): NutritionModulationReason {
  if (!session || session.sessionType === "rest") return "rest";
  if (session.isIntense || session.sessionType === "strength") return "intensity";
  return "endurance";
}

function latestWeightKg(context: PlanningContext): number {
  const withWeight = context.history.bodyMetrics.filter((m) => m.weightKg !== null);
  if (withWeight.length === 0) return DEFAULT_WEIGHT_KG;
  const sorted = [...withWeight].sort((a, b) => (a.measuredOn < b.measuredOn ? 1 : -1));
  return sorted[0]!.weightKg!;
}

export function buildNutritionDays(
  days: string[],
  sessionsByDate: Map<string, PlannedSessionDraft>,
  context: PlanningContext,
  ruleset: Ruleset,
  riskRestrictions: RiskRestrictions,
  traceFactory: TraceFactory,
): { nutritionDays: NutritionDayDraft[]; traces: DecisionTrace[] } {
  const maxDeficitPct = requireNonNull(ruleset.params.nutrition.max_daily_deficit_pct, "nutrition.max_daily_deficit_pct");
  const floorMale = requireNonNull(ruleset.params.nutrition.absolute_kcal_floor_male, "nutrition.absolute_kcal_floor_male");
  const floorFemale = requireNonNull(ruleset.params.nutrition.absolute_kcal_floor_female, "nutrition.absolute_kcal_floor_female");
  const [proteinMin, proteinMax] = ruleset.params.nutrition.protein_g_per_kg_range;
  const proteinPerKg = (requireNonNull(proteinMin, "nutrition.protein_g_per_kg_range[0]") + requireNonNull(proteinMax, "nutrition.protein_g_per_kg_range[1]")) / 2;
  const carbModulation = ruleset.params.nutrition.carb_modulation_by_session_type;

  const weightKg = latestWeightKg(context);
  // Sexe non déclaré : on retient le plancher le plus PROTECTEUR (le plus élevé), jamais l'inverse.
  const kcalSafetyFloor =
    context.profile.sexAtBirth === "male" ? floorMale : context.profile.sexAtBirth === "female" ? floorFemale : Math.max(floorMale, floorFemale);
  const maintenanceKcal = Math.round(weightKg * MAINTENANCE_KCAL_PER_KG);

  const traces: DecisionTrace[] = [];
  const nutritionDays: NutritionDayDraft[] = [];

  for (const date of days) {
    const session = sessionsByDate.get(date);
    const modulationReason = modulationReasonForSession(session);
    const carbPerKg = requireNonNull(carbModulation[modulationReason], `nutrition.carb_modulation_by_session_type.${modulationReason}`);

    const sessionLoadBonus = session ? Math.round(session.loadUnits * 0.5) : 0;
    let kcalTarget = maintenanceKcal + sessionLoadBonus;

    if (riskRestrictions.blockCalorieDeficit) {
      kcalTarget = Math.max(kcalTarget, maintenanceKcal);
    }

    const maxDeficitKcal = Math.round(maintenanceKcal * (maxDeficitPct / 100));
    const minAllowedKcal = maintenanceKcal - maxDeficitKcal;
    let deficitClamped = false;
    if (kcalTarget < minAllowedKcal) {
      kcalTarget = minAllowedKcal;
      deficitClamped = true;
    }

    let floorClamped = false;
    if (kcalTarget < kcalSafetyFloor) {
      kcalTarget = kcalSafetyFloor;
      floorClamped = true;
    }

    const proteinG = Math.round(weightKg * proteinPerKg);
    const carbsG = Math.round(weightKg * carbPerKg);
    const fatKcalBudget = kcalTarget - proteinG * KCAL_PER_G_PROTEIN - carbsG * KCAL_PER_G_CARB;
    const fatG = Math.max(Math.round(weightKg * MIN_FAT_G_PER_KG), Math.round(fatKcalBudget / KCAL_PER_G_FAT));

    const trace = traceFactory.make({
      ruleId: floorClamped ? RULE_IDS.nutritionFloorApplied : deficitClamped ? RULE_IDS.nutritionRiskDeficitBlocked : RULE_IDS.nutritionDay,
      ruleVersion: RULE_VERSION,
      category: "nutrition",
      isHardGuardrail: floorClamped || deficitClamped || riskRestrictions.blockCalorieDeficit,
      scope: "nutrition_day",
      scopeRefId: null,
      scopeRefDate: date,
      conditionExpr: `modulationReason='${modulationReason}', maintenance(${maintenanceKcal}) + sessionBonus(${sessionLoadBonus}), floor=${kcalSafetyFloor}`,
      inputsUsed: [
        { source: "body_metrics", sourceId: null, field: "weight_kg", value: weightKg, observedOn: context.now },
        { source: "planned_sessions", sourceId: null, field: "load_units", value: session?.loadUnits ?? null, observedOn: date },
      ],
      output: { field: "kcal_target", before: null, after: kcalTarget, direction: "neutral" },
      severity: floorClamped ? "warning" : "info",
    });
    traces.push(trace);

    nutritionDays.push({
      date,
      modulationReason,
      kcalTarget,
      kcalSafetyFloor,
      proteinG,
      carbsG,
      fatG,
      hydrationMl: session ? 500 + session.loadUnits * 5 : 1500,
      advicePre: modulationReason === "rest" ? "Jour de repos : repas équilibré, pas de préparation spécifique." : "Repas riche en glucides 2-3h avant la séance, hydratation régulière.",
      adviceDuring: modulationReason === "intensity" ? "Hydratation + apport glucidique si séance > 60 min." : "Hydratation régulière.",
      advicePost: "Apport protéiné dans les 30-60 min suivant la séance pour la récupération.",
      traceIds: [trace.id],
    });
  }

  return { nutritionDays, traces };
}
