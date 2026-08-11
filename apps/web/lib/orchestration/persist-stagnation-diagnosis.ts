import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import { createTraceFactory, evaluateStagnation } from "@hybride/rules-engine";
import type { LlmProvider } from "@hybride/coach-llm";
import type { PlanningContext, Ruleset } from "@hybride/domain";

import { renderExplanationForTraces } from "./render-explanations";

/**
 * `persistStagnationDiagnosis()` (AC6, AC7) — extrait de `run-weekly-review.ts` (finding I6,
 * revue post-Lot L5) pour être partagé avec `GET /api/v1/progress/diagnosis` : ce dernier
 * dupliquait la même écriture `engine_runs`/`decision_traces`/`explanations` SANS jamais persister
 * de ligne `stagnation_diagnoses` (`explanations.subject_id` pointait vers un `randomUUID()` sans
 * ligne correspondante — bruit d'audit permanent) ET sans aucune idempotence : chaque rafraîchissement
 * de la page réécrivait ces trois tables et rappelait le LLM. Idempotent par construction
 * (`unique(user_id, evaluated_on)`, `ignoreDuplicates: true`) : un second appel le même jour est un
 * no-op sur `stagnation_diagnoses` — c'est cette idempotence que `readPersistedDiagnosis()`
 * (`progress/diagnosis/route.ts`) exploite pour servir le résultat déjà écrit plutôt que de
 * recalculer/réappeler le LLM à chaque requête.
 */
export async function persistStagnationDiagnosis(
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    now: string;
    ruleset: Ruleset;
    context: PlanningContext;
    llmProvider: LlmProvider;
  },
): Promise<void> {
  const { userId, now, ruleset, context, llmProvider } = args;
  const traceFactory = createTraceFactory(ruleset.version);

  let result: ReturnType<typeof evaluateStagnation>;
  try {
    result = evaluateStagnation(context, ruleset, traceFactory);
  } catch (error) {
    // ADR-007 : les seuils `stagnation.*` peuvent légitimement être `null` en dev
    // (`docs/rulesets/0.1.0-dev.md`) — dégradation explicite, jamais un échec complet.
    console.warn(`[stagnation-diagnosis] evaluateStagnation indisponible pour user=${userId} : ${error instanceof Error ? error.message : error}`);
    return;
  }

  const weeks = context.history.completedWeeks;
  const windowStart = weeks[0]?.weekStart ?? now;
  const windowEnd = weeks[weeks.length - 1]?.weekStart ?? now;

  const engineRunId = randomUUID();
  const { error: engineRunError } = await admin.from("engine_runs").insert({
    id: engineRunId,
    user_id: userId,
    trigger: "stagnation",
    ruleset_version: ruleset.version,
    input_snapshot_hash: `stagnation-diagnosis:${userId}:${now}`,
    status: "succeeded",
    finished_at: new Date().toISOString(),
  });
  if (engineRunError) throw new Error(`persistStagnationDiagnosis: engine_runs — ${engineRunError.message}`);

  const traceId = randomUUID();
  const { error: traceError } = await admin.from("decision_traces").insert({
    id: traceId,
    user_id: userId,
    engine_run_id: engineRunId,
    plan_version_id: null,
    ruleset_version: result.trace.rulesetVersion,
    rule_id: result.trace.ruleId,
    rule_version: result.trace.ruleVersion,
    category: result.trace.category,
    is_hard_guardrail: result.trace.isHardGuardrail,
    scope: result.trace.scope,
    scope_ref_id: result.trace.scopeRefId,
    scope_ref_date: result.trace.scopeRefDate,
    condition_expr: result.trace.conditionExpr,
    inputs_used: result.trace.inputsUsed as unknown as Json,
    output: result.trace.output as unknown as Json,
    severity: result.trace.severity,
  });
  if (traceError) throw new Error(`persistStagnationDiagnosis: decision_traces — ${traceError.message}`);

  const diagnosisId = randomUUID();
  const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "stagnation_diagnosis", traces: [result.trace] });
  const explanationId = randomUUID();
  const { error: explanationError } = await admin.from("explanations").insert({
    id: explanationId,
    user_id: userId,
    subject_type: "stagnation_diagnosis",
    subject_id: diagnosisId,
    short_text: rendered.shortText,
    long_text: rendered.longText,
    generated_by: rendered.generatedBy,
    llm_model: rendered.llmModel,
    numeric_integrity_ok: rendered.numericIntegrityOk,
    fallback_used: rendered.fallbackUsed,
    confidence: result.confidence,
    decision_trace_ids: [traceId],
  });
  if (explanationError) throw new Error(`persistStagnationDiagnosis: explanations — ${explanationError.message}`);

  const { error: upsertError } = await admin.from("stagnation_diagnoses").upsert(
    {
      id: diagnosisId,
      user_id: userId,
      evaluated_on: now,
      window_start: windowStart,
      window_end: windowEnd,
      weeks_available: result.weeksAvailable,
      status: result.status,
      indicator: result.indicator,
      diagnosis: result.diagnosis,
      evidence: result.evidence as unknown as Json,
      recommended_action: result.recommendedAction,
      engine_run_id: engineRunId,
      explanation_id: explanationId,
    },
    { onConflict: "user_id,evaluated_on", ignoreDuplicates: true },
  );
  if (upsertError) throw new Error(`persistStagnationDiagnosis: stagnation_diagnoses — ${upsertError.message}`);
}
