import "server-only";

import { randomUUID } from "node:crypto";

import {
  renderExplanation,
  type ExplanationSubjectType,
  type LlmProvider,
  type LlmTraceInput,
  type RenderExplanationOutput,
} from "@hybride/coach-llm";
import type { DecisionTrace } from "@hybride/domain";

/**
 * `renderExplanations()` — LLM (ou repli template, ADR-002 §3) à partir des `DecisionTrace` DÉJÀ
 * calculées par le moteur. Ce module ne fait AUCUNE écriture base : c'est `materialize-plan-version.ts`
 * qui persiste la ligne `explanations` (il a besoin du `subject_id` — l'id de la ligne
 * `planned_sessions`/`nutrition_days` déjà insérée — que ce module ignore volontairement).
 *
 * Minimisation ADR-010 §4 : le LLM ne reçoit qu'un `correlationId` éphémère (généré ici, jamais un
 * `user_id`) et des `DecisionTrace` réduites à `LlmTraceInput` (jamais `user_id`, jamais l'`id` de
 * base des traces).
 */

function toLlmTraceInput(trace: DecisionTrace): LlmTraceInput {
  return {
    ruleId: trace.ruleId,
    category: trace.category,
    conditionExpr: trace.conditionExpr,
    inputs: trace.inputsUsed.map((input) => ({ field: input.field, value: input.value })),
    output: {
      field: trace.output.field,
      before: trace.output.before,
      after: trace.output.after,
      direction: trace.output.direction,
    },
  };
}

export async function renderExplanationForTraces(
  provider: LlmProvider,
  args: { subjectType: ExplanationSubjectType; traces: DecisionTrace[] },
): Promise<RenderExplanationOutput> {
  if (args.traces.length === 0) {
    throw new Error(`renderExplanationForTraces: aucune trace fournie (subject=${args.subjectType}).`);
  }

  return renderExplanation(provider, {
    subjectType: args.subjectType,
    traces: args.traces.map(toLlmTraceInput),
    correlationId: randomUUID(),
  });
}
