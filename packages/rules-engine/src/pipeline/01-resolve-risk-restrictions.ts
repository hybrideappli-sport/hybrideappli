/**
 * Étape 1 — `resolveRiskRestrictions` (AC3).
 *
 * Traduit les `risk_flags` actifs en restrictions dures consommées par les
 * étapes suivantes (essentiellement la nutrition, étape 10 — AC11 : jamais
 * de déficit calorique pour un profil grossesse/TCA).
 */

import type { DecisionTrace, PlanningContext } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids.js";
import type { TraceFactory } from "../lib/trace.js";

export interface RiskRestrictions {
  blockCalorieDeficit: boolean;
  requiresMedicalClearance: boolean;
}

export function resolveRiskRestrictions(
  context: PlanningContext,
  traceFactory: TraceFactory,
): { restrictions: RiskRestrictions; traces: DecisionTrace[] } {
  const activeFlags = context.riskFlags.filter((f) => f.isActive);
  let blockCalorieDeficit = false;
  let requiresMedicalClearance = false;
  const traces: DecisionTrace[] = [];

  for (const flag of activeFlags) {
    const explicitBlockDeficit = flag.restrictions["blockCalorieDeficit"] === true;
    if (flag.flagType === "pregnancy" || flag.flagType === "eating_disorder_history" || explicitBlockDeficit) {
      blockCalorieDeficit = true;
      traces.push(
        traceFactory.make({
          ruleId: RULE_IDS.riskBlockCalorieDeficit,
          ruleVersion: RULE_VERSION,
          category: "risk_restriction",
          isHardGuardrail: true,
          scope: "plan",
          scopeRefId: null,
          scopeRefDate: context.now,
          conditionExpr: `risk_flags.flag_type = '${flag.flagType}' (active)`,
          inputsUsed: [
            { source: "risk_flags", sourceId: null, field: "flag_type", value: flag.flagType, observedOn: context.now },
          ],
          output: { field: "block_calorie_deficit", before: false, after: true, direction: "neutral" },
          severity: "critical",
        }),
      );
    }

    if (flag.flagType === "pathology" || flag.flagType === "minor") {
      requiresMedicalClearance = true;
      traces.push(
        traceFactory.make({
          ruleId: RULE_IDS.riskMedicalClearance,
          ruleVersion: RULE_VERSION,
          category: "risk_restriction",
          isHardGuardrail: true,
          scope: "plan",
          scopeRefId: null,
          scopeRefDate: context.now,
          conditionExpr: `risk_flags.flag_type = '${flag.flagType}' (active)`,
          inputsUsed: [
            { source: "risk_flags", sourceId: null, field: "flag_type", value: flag.flagType, observedOn: context.now },
          ],
          output: { field: "requires_medical_clearance", before: false, after: true, direction: "neutral" },
          severity: "warning",
        }),
      );
    }
  }

  return { restrictions: { blockCalorieDeficit, requiresMedicalClearance }, traces };
}
