/**
 * Étape 7 — `distributeAcrossSports` (AC10).
 *
 * Répartit la charge GLOBALE (et non par sport isolé) entre les disciplines
 * pratiquées, selon `interference.global_load_distribution_strategy`.
 */

import type { AthleteSportSnapshot, DecisionTrace, PlanningContext, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids.js";
import type { TraceFactory } from "../lib/trace.js";

export interface SportAllocation {
  sport: AthleteSportSnapshot;
  fraction: number; // somme = 1 sur l'ensemble des sports pratiqués
}

export function distributeAcrossSports(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { allocations: SportAllocation[]; traces: DecisionTrace[] } {
  const sports = context.sports;
  const strategy = ruleset.params.interference.global_load_distribution_strategy;

  let weights: number[];
  if (sports.length === 0) {
    weights = [];
  } else if (strategy === "equal") {
    weights = sports.map(() => 1);
  } else {
    // 'by_priority' : priority 1 = poids le plus fort ; bonus pour le sport principal déclaré.
    weights = sports.map((s) => (1 / Math.max(1, s.priority)) * (s.isPrimary ? 1.25 : 1));
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const allocations: SportAllocation[] = sports.map((sport, i) => ({
    sport,
    fraction: totalWeight > 0 ? weights[i]! / totalWeight : 0,
  }));

  const trace = traceFactory.make({
    ruleId: RULE_IDS.sportDistribution,
    ruleVersion: RULE_VERSION,
    category: "interference",
    isHardGuardrail: false,
    scope: "plan",
    scopeRefId: null,
    scopeRefDate: context.now,
    conditionExpr: `strategy='${strategy}', ${sports.length} sport(s) pratiqué(s)`,
    inputsUsed: sports.map((s) => ({
      source: "athlete_sports",
      sourceId: s.sportId,
      field: "priority",
      value: s.priority,
      observedOn: context.now,
    })),
    output: {
      field: "sport_distribution",
      before: null,
      after: allocations.map((a) => ({ sportCode: a.sport.code, fraction: Math.round(a.fraction * 1000) / 1000 })),
      direction: "neutral",
    },
    severity: "info",
  });

  return { allocations, traces: [trace] };
}
