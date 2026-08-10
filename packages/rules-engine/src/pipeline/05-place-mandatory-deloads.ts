/**
 * Étape 5 — `placeMandatoryDeloads` (AC8).
 *
 * Marque `is_deload = true` sur la DERNIÈRE semaine de chaque bloc, tous les
 * `deload_every_n_blocks` blocs — non désactivable en V1 (aucune branche de
 * code ne permet de sauter cette étape). La valeur numérique de la
 * réduction est appliquée à l'étape 6 ; ici on ne fait QUE marquer la
 * semaine (décision structurelle, tracée séparément de son effet chiffré).
 */

import type { DecisionTrace, PlanBlockDraft, PlanWeekDraft, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids";
import type { TraceFactory } from "../lib/trace";
import { requireNonNull } from "../lib/require-non-null";

export function placeMandatoryDeloads(
  blocks: PlanBlockDraft[],
  weeks: PlanWeekDraft[],
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { weeks: PlanWeekDraft[]; traces: DecisionTrace[] } {
  const everyNBlocks = requireNonNull(ruleset.params.guardrails.deload_every_n_blocks, "guardrails.deload_every_n_blocks");

  const updatedWeeks = weeks.map((w) => ({ ...w }));
  const traces: DecisionTrace[] = [];

  for (const block of blocks) {
    const isDeloadBlock = (block.blockIndex + 1) % everyNBlocks === 0;
    if (!isDeloadBlock) continue;

    const weeksInBlock = updatedWeeks.filter((w) => w.blockIndex === block.blockIndex);
    const lastWeek = weeksInBlock[weeksInBlock.length - 1];
    if (!lastWeek) continue;

    const idx = updatedWeeks.findIndex((w) => w.weekStart === lastWeek.weekStart);
    const trace = traceFactory.make({
      ruleId: RULE_IDS.deloadInserted,
      ruleVersion: RULE_VERSION,
      category: "guardrail",
      isHardGuardrail: true,
      scope: "week",
      scopeRefId: null,
      scopeRefDate: lastWeek.weekStart,
      conditionExpr: `(block_index(${block.blockIndex}) + 1) % deload_every_n_blocks(${everyNBlocks}) === 0`,
      inputsUsed: [
        { source: "rulesets", sourceId: null, field: "guardrails.deload_every_n_blocks", value: everyNBlocks, observedOn: null },
      ],
      output: { field: "is_deload", before: false, after: true, direction: "neutral" },
      severity: "info",
    });
    traces.push(trace);
    updatedWeeks[idx] = { ...updatedWeeks[idx]!, isDeload: true, traceIds: [...updatedWeeks[idx]!.traceIds, trace.id] };
  }

  return { weeks: updatedWeeks, traces };
}
