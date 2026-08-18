import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import { createTraceFactory, evaluatePainProtocol } from "@hybride/rules-engine";
import type { BodyZone, CreateSessionLogResponse, DecisionTrace, PainLevel, PlanTrigger } from "@hybride/domain";

import { getLlmProvider } from "../coach-llm-provider";
import { addDaysIso } from "../dates";
import { finalizeSessionLogLoad } from "../data/finalize-session-log-load";
import { reconcileSessionLogs, replayEnrichmentOnExcludedLogUpdate } from "../data/reconcile-session-logs";
import { refreshDataRegime } from "../data/refresh-data-regime";
import { PAIN_REFERRAL_MESSAGES } from "../pain-referral-messages";
import { recalculateHybridScoreQuietly } from "../score/compute-and-store-hybrid-score";
import { buildPlanningContext } from "./build-planning-context";
import { getActiveRuleset } from "./get-active-ruleset";
import { fetchTodaySessionView } from "./read-today-plan";
import { regeneratePlan } from "./regenerate-plan";
import { renderExplanationForTraces } from "./render-explanations";

export class SessionLogPersistenceError extends Error {}
export class NoActivePlanError extends Error {}

const HIGH_RPE_THRESHOLD = 8;
const LOW_FRESHNESS_THRESHOLD = 2;

function isNegativeSignal(signals: { rpe: number | null; freshness: number | null; pain: PainLevel }): boolean {
  return (signals.rpe !== null && signals.rpe >= HIGH_RPE_THRESHOLD) || (signals.freshness !== null && signals.freshness <= LOW_FRESHNESS_THRESHOLD) || signals.pain !== "none";
}

export interface SessionLogSignals {
  rpe: number | null;
  freshness: number | null;
  pain: PainLevel;
  painZone: BodyZone | null;
}

export type ReconciliationMode = "match" | "replay-if-excluded" | "skip";

/**
 * `runSessionLogSignalPipeline()` — logique commune à `POST /session-logs` (`applyDailyLog()`) et
 * `PATCH /session-logs/:id` (`applySessionLogCorrection()`), APRÈS que la ligne `session_logs` a
 * été persistée (insérée ou mise à jour). Extrait tel quel de `apply-daily-log.ts` (US-02) pour que
 * la correction (Lot F3, `11-design-notes.md` §3.3) bénéficie exactement du même protocole douleur
 * (AC9) et de la même asymétrie d'ajustement (AC4, ADR-005 §5) que la saisie initiale — aucune
 * seconde implémentation à maintenir en parallèle.
 *
 * `reconciliationMode` :
 *  - `"match"` — POST : appariement complet contre les autres lignes non exclues (ADR-015 §2).
 *  - `"replay-if-excluded"` — PATCH : ADR-015 « Conséquences », dernier point : un `PATCH` sur une
 *    ligne déjà exclue (perdante d'une fusion) REJOUE l'enrichissement de la ligne portante au lieu
 *    de tenter un nouvel appariement (la ligne cible reste exclue, elle ne peut pas redevenir
 *    portante d'elle-même — `unmerge` reste le seul chemin qui la restaure).
 *  - `"skip"` — jamais utilisé aujourd'hui, réservé aux appelants qui gèrent la réconciliation eux-mêmes.
 */
/**
 * Ne prend volontairement QUE le client `service_role` : tout ce qui suit la persistance
 * (charge réalisée, réconciliation, score, protocole douleur, ajustement) est un effet de bord
 * serveur, jamais soumis à RLS — la persistance elle-même (`INSERT`/`UPDATE`, RLS active) reste la
 * responsabilité de l'appelant (`applyDailyLog()`, `applySessionLogCorrection()`).
 */
export async function runSessionLogSignalPipeline(
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; logId: string; signals: SessionLogSignals; reconciliationMode: ReconciliationMode },
): Promise<Pick<CreateSessionLogResponse, "adjustment" | "painProtocol" | "nextSession" | "reconciliation">> {
  const { userId, now, logId, signals, reconciliationMode } = args;

  // US-02, ADR-015 §1/§2 — point de contact #1 de `08-architecture.md` §13.6 : charge réalisée
  // (chemin d'écriture unique, service_role) PUIS résolution de doublon (AC5).
  await finalizeSessionLogLoad(admin, { logId, userId });

  let reconciliation: CreateSessionLogResponse["reconciliation"] = { merged: false, survivingLogId: logId };
  if (reconciliationMode === "match") {
    const result = await reconcileSessionLogs(admin, { userId, logId });
    reconciliation = { merged: result.merged, survivingLogId: result.survivingLogId };
  } else if (reconciliationMode === "replay-if-excluded") {
    const result = await replayEnrichmentOnExcludedLogUpdate(admin, { userId, logId });
    reconciliation = { merged: result.replayed, survivingLogId: result.survivingLogId ?? logId };
  }

  await refreshDataRegime(admin, userId);
  // AC7 — « recalculé à chaque nouvelle donnée pertinente » (ADR-014 §5).
  await recalculateHybridScoreQuietly(admin, { userId, now });

  const { data: activePlan, error: planError } = await admin
    .from("plans")
    .select("id, objective_id, current_version_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (planError) throw new Error(`runSessionLogSignalPipeline: plans — ${planError.message}`);
  if (!activePlan) {
    throw new NoActivePlanError("runSessionLogSignalPipeline: aucun plan actif — l'onboarding doit être terminé avant toute saisie (AC4).");
  }

  const ruleset = await getActiveRuleset(admin);
  const llmProvider = getLlmProvider();

  const { context } = await buildPlanningContext(admin, {
    userId,
    now,
    trigger: "negative_signal",
    objectiveId: activePlan.objective_id,
  });

  // 2) AC9 — protocole douleur, uniquement sur la zone concernée par CETTE saisie.
  let painProtocolResponse: CreateSessionLogResponse["painProtocol"] = { level: "none", zoneBlocked: false, referral: null };
  let painProtocolTriggersRegeneration = false;

  if (signals.pain !== "none" && signals.painZone) {
    const traceFactory = createTraceFactory(ruleset.version);
    const painResult = evaluatePainProtocol(context, ruleset, traceFactory);
    const zoneState = painResult.zoneStates.find((z) => z.zone === signals.painZone);

    if (zoneState) {
      const { data: existingRow, error: existingRowError } = await admin
        .from("pain_episodes")
        .select("id, referral_issued")
        .eq("user_id", userId)
        .eq("zone", signals.painZone)
        .is("resolved_at", null)
        .maybeSingle();
      if (existingRowError) throw new Error(`runSessionLogSignalPipeline: pain_episodes (lecture) — ${existingRowError.message}`);

      const referralAlreadyIssued = existingRow?.referral_issued ?? false;
      const referralNewlyRequired = zoneState.referralRequired && !referralAlreadyIssued;

      let painEpisodeId: string;
      if (existingRow) {
        const { error } = await admin
          .from("pain_episodes")
          .update({
            level: zoneState.level,
            consecutive_signals: zoneState.consecutiveSignals,
            last_signal_on: now,
            zone_blocked: zoneState.zoneBlocked,
            referral_issued: zoneState.referralRequired || referralAlreadyIssued,
            ...(referralNewlyRequired ? { referral_issued_at: new Date().toISOString() } : {}),
          })
          .eq("id", existingRow.id);
        if (error) throw new Error(`runSessionLogSignalPipeline: pain_episodes (mise à jour) — ${error.message}`);
        painEpisodeId = existingRow.id;
      } else {
        const { data: created, error } = await admin
          .from("pain_episodes")
          .insert({
            user_id: userId,
            zone: signals.painZone,
            level: zoneState.level,
            consecutive_signals: zoneState.consecutiveSignals,
            first_signal_on: now,
            last_signal_on: now,
            zone_blocked: zoneState.zoneBlocked,
            referral_issued: zoneState.referralRequired,
            ...(zoneState.referralRequired ? { referral_issued_at: new Date().toISOString() } : {}),
          })
          .select("id")
          .single();
        if (error) throw new Error(`runSessionLogSignalPipeline: pain_episodes (création) — ${error.message}`);
        painEpisodeId = created.id;
      }

      const engineRunId = randomUUID();
      const { error: engineRunError } = await admin.from("engine_runs").insert({
        id: engineRunId,
        user_id: userId,
        trigger: "pain_protocol" satisfies PlanTrigger,
        ruleset_version: ruleset.version,
        input_snapshot_hash: `pain-protocol:${logId}`,
        status: "succeeded",
        finished_at: new Date().toISOString(),
      });
      if (engineRunError) throw new Error(`runSessionLogSignalPipeline: engine_runs (douleur) — ${engineRunError.message}`);

      const traceId = randomUUID();
      const { error: traceError } = await admin.from("decision_traces").insert({
        id: traceId,
        user_id: userId,
        engine_run_id: engineRunId,
        plan_version_id: null,
        ruleset_version: zoneState.trace.rulesetVersion,
        rule_id: zoneState.trace.ruleId,
        rule_version: zoneState.trace.ruleVersion,
        category: zoneState.trace.category,
        is_hard_guardrail: zoneState.trace.isHardGuardrail,
        scope: zoneState.trace.scope,
        scope_ref_id: zoneState.trace.scopeRefId,
        scope_ref_date: zoneState.trace.scopeRefDate,
        condition_expr: zoneState.trace.conditionExpr,
        inputs_used: zoneState.trace.inputsUsed as unknown as Json,
        output: zoneState.trace.output as unknown as Json,
        severity: zoneState.trace.severity,
      });
      if (traceError) throw new Error(`runSessionLogSignalPipeline: decision_traces (douleur) — ${traceError.message}`);

      const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "pain_episode", traces: [zoneState.trace] });
      const explanationId = randomUUID();
      const { error: explanationError } = await admin.from("explanations").insert({
        id: explanationId,
        user_id: userId,
        subject_type: "pain_episode",
        subject_id: painEpisodeId,
        short_text: rendered.shortText,
        long_text: rendered.longText,
        generated_by: rendered.generatedBy,
        llm_model: rendered.llmModel,
        numeric_integrity_ok: rendered.numericIntegrityOk,
        fallback_used: rendered.fallbackUsed,
        confidence: "high",
        decision_trace_ids: [traceId],
      });
      if (explanationError) throw new Error(`runSessionLogSignalPipeline: explanations (douleur) — ${explanationError.message}`);

      await admin.from("pain_episodes").update({ explanation_id: explanationId }).eq("id", painEpisodeId);

      painProtocolResponse = {
        level: zoneState.level,
        zoneBlocked: zoneState.zoneBlocked,
        referral: zoneState.referralRequired
          ? { required: true, message: PAIN_REFERRAL_MESSAGES[zoneState.level === "acute" ? "acute" : "persistent"] }
          : null,
      };
      painProtocolTriggersRegeneration = zoneState.level === "persistent" || zoneState.level === "acute";
    }
  }

  // 3) AC4 — ajustement immédiat à la baisse. `pain_protocol` prime sur `negative_signal`.
  const trigger: PlanTrigger | null = painProtocolTriggersRegeneration ? "pain_protocol" : isNegativeSignal(signals) ? "negative_signal" : null;

  let adjustment: CreateSessionLogResponse["adjustment"] = { applied: false, direction: "none", planVersionId: null, affectedDates: [], explanation: null };

  if (trigger) {
    const result = await regeneratePlan(admin, { userId, objectiveId: activePlan.objective_id, trigger, now });
    if (result.outcome === "plan_generated") {
      const affectedDates = Array.from({ length: 7 }, (_, i) => addDaysIso(now, i));

      const { data: reductionTraceRow, error: reductionTraceError } = await admin
        .from("decision_traces")
        .select("id, rule_id, rule_version, ruleset_version, category, is_hard_guardrail, scope, scope_ref_id, scope_ref_date, condition_expr, inputs_used, output, severity")
        .eq("plan_version_id", result.planVersionId)
        .eq("rule_id", "progression.negative_signal_reduction")
        .limit(1)
        .maybeSingle();
      if (reductionTraceError) throw new Error(`runSessionLogSignalPipeline: decision_traces (ajustement) — ${reductionTraceError.message}`);

      let explanation: CreateSessionLogResponse["adjustment"]["explanation"] = null;
      if (reductionTraceRow) {
        const trace: DecisionTrace = {
          id: reductionTraceRow.id,
          ruleId: reductionTraceRow.rule_id,
          ruleVersion: reductionTraceRow.rule_version,
          rulesetVersion: reductionTraceRow.ruleset_version,
          category: reductionTraceRow.category as DecisionTrace["category"],
          isHardGuardrail: reductionTraceRow.is_hard_guardrail,
          scope: reductionTraceRow.scope as DecisionTrace["scope"],
          scopeRefId: reductionTraceRow.scope_ref_id,
          scopeRefDate: reductionTraceRow.scope_ref_date,
          conditionExpr: reductionTraceRow.condition_expr,
          inputsUsed: reductionTraceRow.inputs_used as unknown as DecisionTrace["inputsUsed"],
          output: reductionTraceRow.output as unknown as DecisionTrace["output"],
          severity: reductionTraceRow.severity as DecisionTrace["severity"],
        };
        const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "plan_version", traces: [trace] });
        const explanationId = randomUUID();
        const { error: explanationError } = await admin.from("explanations").insert({
          id: explanationId,
          user_id: userId,
          subject_type: "plan_version",
          subject_id: result.planVersionId,
          short_text: rendered.shortText,
          long_text: rendered.longText,
          generated_by: rendered.generatedBy,
          llm_model: rendered.llmModel,
          numeric_integrity_ok: rendered.numericIntegrityOk,
          fallback_used: rendered.fallbackUsed,
          confidence: "high",
          decision_trace_ids: [trace.id],
        });
        if (explanationError) throw new Error(`runSessionLogSignalPipeline: explanations (ajustement) — ${explanationError.message}`);
        explanation = { short: rendered.shortText, explanationId };
      }

      adjustment = { applied: true, direction: "decrease", planVersionId: result.planVersionId, affectedDates, explanation };
    }
  }

  // 4) Séance suivante — J+1.
  const { data: refreshedPlan, error: refreshedPlanError } = await admin
    .from("plans")
    .select("current_version_id")
    .eq("id", activePlan.id)
    .maybeSingle();
  if (refreshedPlanError) throw new Error(`runSessionLogSignalPipeline: plans (relecture) — ${refreshedPlanError.message}`);

  const nextSession = refreshedPlan?.current_version_id
    ? await fetchTodaySessionView(admin, {
        userId,
        planVersionId: refreshedPlan.current_version_id,
        date: addDaysIso(now, 1),
        now: { date: now, time: "00:00" },
        ruleset,
      })
    : null;

  return { adjustment, painProtocol: painProtocolResponse, nextSession, reconciliation };
}
