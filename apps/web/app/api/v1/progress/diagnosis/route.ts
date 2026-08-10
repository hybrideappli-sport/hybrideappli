import { randomUUID } from "node:crypto";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { Json } from "@hybride/db/types";
import { createTraceFactory, evaluateStagnation } from "@hybride/rules-engine";
import type { ExplanationDetailView, ProgressDiagnosisResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getLlmProvider } from "@/lib/coach-llm-provider";
import { aggregateCompletedWeeks } from "@/lib/orchestration/aggregate-completed-weeks";
import { buildPlanningContext } from "@/lib/orchestration/build-planning-context";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { renderExplanationForTraces } from "@/lib/orchestration/render-explanations";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/progress/diagnosis` — AC6, AC7 (`08-architecture.md` §6.5).
 *
 * Arbitrage explicite du Lot L4 (le job de révision hebdomadaire qui alimenterait
 * `stagnation_diagnoses` n'existe pas encore — c'est le Lot L5) : cette route ne LIT PAS
 * `stagnation_diagnoses` et n'en dépend pas. Elle calcule un diagnostic « à la volée », à chaque
 * appel, à partir des données déjà disponibles (`session_logs`/`nutrition_checkins`/`body_metrics`
 * des 70 derniers jours, agrégées en semaines par `aggregateCompletedWeeks()` — voir son en-tête
 * pour les approximations assumées faute d'agrégation canonique). C'est un choix DÉLIBÉRÉMENT
 * simple : AUCUNE écriture (contrairement à `applyDailyLog`/`regeneratePlan`), sortie recalculée
 * systématiquement plutôt que mise en cache. Le Lot L5 pourra soit remplacer ce calcul par une
 * lecture de `stagnation_diagnoses` (rempli par le job dominical), soit le conserver comme repli
 * pour un appel hors cycle hebdomadaire — à trancher à ce moment-là.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();

  const { data: activePlan, error: planError } = await admin
    .from("plans")
    .select("objective_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (planError) return apiError(500, "INTERNAL_ERROR", planError.message);
  if (!activePlan) {
    return apiError(409, "CONFLICT", "Aucun plan actif — termine l'onboarding avant de consulter ta progression.");
  }

  const ruleset = await getActiveRuleset(admin);
  const { context } = await buildPlanningContext(admin, {
    userId: user.id,
    now,
    trigger: "stagnation",
    objectiveId: activePlan.objective_id,
  });

  const completedWeeks = aggregateCompletedWeeks(context.history);
  const contextWithWeeks = { ...context, history: { ...context.history, completedWeeks } };

  const traceFactory = createTraceFactory(ruleset.version);

  let result: ReturnType<typeof evaluateStagnation>;
  try {
    result = evaluateStagnation(contextWithWeeks, ruleset, traceFactory);
  } catch (error) {
    // ADR-007 : seuls les paramètres `guardrails.*` sont bloquants dès le démarrage — les seuils de
    // `stagnation.*` (`nonadherence_completion_rate_threshold`, `overload_rpe_trend_threshold`)
    // peuvent légitimement rester `null` en dev (`docs/rulesets/0.1.0-dev.md`). Dégradation
    // explicite plutôt qu'un 500 : le produit ne doit jamais planter faute de configuration.
    console.warn("[progress/diagnosis] evaluateStagnation indisponible (seuils non configurés) :", error instanceof Error ? error.message : error);
    const body: ProgressDiagnosisResponse = {
      status: "calibration",
      weeksAvailable: completedWeeks.length,
      weeksRequired: ruleset.params.stagnation.calibration_min_weeks,
      message: "Le coach ne peut pas encore se prononcer sur ta progression — réessaie plus tard.",
      confidence: "calibrating",
    };
    return apiJson<ProgressDiagnosisResponse>(body, { headers: { "Cache-Control": "no-store" } });
  }

  if (result.status === "calibration") {
    const body: ProgressDiagnosisResponse = {
      status: "calibration",
      weeksAvailable: result.weeksAvailable,
      weeksRequired: result.weeksRequired,
      message: `Le coach a besoin d'au moins ${result.weeksRequired} semaines de données comparables avant de pouvoir se prononcer sur ta progression — il ne peut pas encore conclure (phase de calibration).`,
      confidence: "calibrating",
    };
    return apiJson<ProgressDiagnosisResponse>(body, { headers: { "Cache-Control": "no-store" } });
  }

  // AC6/AC7 — un diagnostic « je ne sais pas encore »/« pas de stagnation » reste traçable au même
  // titre qu'un diagnostic positif (ADR-006) : `engine_runs` + `decision_traces` dédiés, même
  // schéma que `persistObjectiveNegotiation` (`regenerate-plan.ts`, Lot L3) pour une évaluation qui
  // n'écrit aucune nouvelle version de plan.
  const llmProvider = getLlmProvider();
  const engineRunId = randomUUID();
  const { error: engineRunError } = await admin.from("engine_runs").insert({
    id: engineRunId,
    user_id: user.id,
    trigger: "stagnation",
    ruleset_version: ruleset.version,
    input_snapshot_hash: `progress-diagnosis:${user.id}:${now}`,
    status: "succeeded",
    finished_at: new Date().toISOString(),
  });
  if (engineRunError) return apiError(500, "INTERNAL_ERROR", engineRunError.message);

  const traceId = randomUUID();
  const { error: traceError } = await admin.from("decision_traces").insert({
    id: traceId,
    user_id: user.id,
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
  if (traceError) return apiError(500, "INTERNAL_ERROR", traceError.message);

  const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "stagnation_diagnosis", traces: [result.trace] });
  const explanationId = randomUUID();
  const { error: explanationError } = await admin.from("explanations").insert({
    id: explanationId,
    user_id: user.id,
    subject_type: "stagnation_diagnosis",
    subject_id: randomUUID(), // aucune ligne `stagnation_diagnoses` persistée à ce lot — voir en-tête.
    short_text: rendered.shortText,
    long_text: rendered.longText,
    generated_by: rendered.generatedBy,
    llm_model: rendered.llmModel,
    numeric_integrity_ok: rendered.numericIntegrityOk,
    fallback_used: rendered.fallbackUsed,
    confidence: result.confidence,
    decision_trace_ids: [traceId],
  });
  if (explanationError) return apiError(500, "INTERNAL_ERROR", explanationError.message);

  const explanation: ExplanationDetailView = { short: rendered.shortText, long: rendered.longText, confidence: result.confidence };

  if (result.status === "no_stagnation") {
    const body: ProgressDiagnosisResponse = {
      status: "no_stagnation",
      indicators: result.evidence.map((e) => ({ label: e.label, current: e.current, previous: e.previous })),
      explanation,
    };
    return apiJson<ProgressDiagnosisResponse>(body, { headers: { "Cache-Control": "no-store" } });
  }

  const body: ProgressDiagnosisResponse = {
    status: "stagnation",
    indicator: result.indicator ?? "unknown",
    diagnosis: result.diagnosis ?? "inconclusive",
    evidence: result.evidence.map((e) => ({ label: e.label, current: e.current, previous: e.previous })),
    // AC6 — cette route est un DIAGNOSTIC lecture seule : elle ne déclenche aucune régénération.
    // L'adaptation proposée est décrite (`recommendedAction`) mais jamais appliquée automatiquement
    // ici (contrairement à `applyDailyLog`) — c'est la révision hebdomadaire (Lot L5) qui matérialise
    // une nouvelle version de plan sur la base d'un diagnostic de stagnation.
    proposedAdaptation: { summary: result.recommendedAction ?? "none", planVersionId: null },
    explanation,
  };
  return apiJson<ProgressDiagnosisResponse>(body, { headers: { "Cache-Control": "no-store" } });
}
