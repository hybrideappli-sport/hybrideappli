import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import { createTraceFactory, evaluatePainProtocol } from "@hybride/rules-engine";
import type { CreateSessionLogInput, CreateSessionLogResponse, DecisionTrace, PlanTrigger } from "@hybride/domain";

import { getLlmProvider } from "../coach-llm-provider";
import { addDaysIso } from "../dates";
import { finalizeSessionLogLoad } from "../data/finalize-session-log-load";
import { reconcileSessionLogs } from "../data/reconcile-session-logs";
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

/**
 * `applyDailyLog()` — le 2ᵉ orchestrateur d'`08-architecture.md` §3.2 : saisie post-séance/repas
 * (AC4) → protocole douleur (AC9) → ajustement immédiat SYNCHRONE à la baisse (jamais à la hausse,
 * ADR-005 §5), en réutilisant `regeneratePlan()` du Lot L3 tel quel (mêmes garanties, mêmes
 * triggers `negative_signal`/`pain_protocol` déjà câblés dans le pipeline moteur — Lot L2,
 * `06-compute-weekly-load-target.ts`).
 *
 * Seuils de détection du signal négatif dupliqués (volontairement) de
 * `packages/rules-engine/src/lib/guardrail-helpers.ts::hasActiveNegativeSignal` — ce module interne
 * au moteur n'est pas exporté par le barrel `@hybride/rules-engine` (surface publique minimale,
 * ADR-003) ; la DÉCISION de déclencher une régénération reste de toute façon une responsabilité
 * d'orchestration distincte de la logique interne du moteur, qui recalcule de toute façon sa propre
 * asymétrie indépendamment de ce déclenchement (défense en profondeur, pas une duplication fragile).
 */
const HIGH_RPE_THRESHOLD = 8;
const LOW_FRESHNESS_THRESHOLD = 2;

function isNegativeSignal(input: CreateSessionLogInput): boolean {
  return (input.rpe !== undefined && input.rpe >= HIGH_RPE_THRESHOLD) || (input.freshness !== undefined && input.freshness <= LOW_FRESHNESS_THRESHOLD) || input.pain !== "none";
}

export async function applyDailyLog(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; input: CreateSessionLogInput },
): Promise<CreateSessionLogResponse> {
  const { userId, now, input } = args;

  // US-02, AC3 — séance HORS PLAN : `sportCode` (déclaratif, choisi par l'utilisateur dans un
  // référentiel public) est résolu en `sport_id` ICI, avant l'insertion — c'est une colonne
  // GRANTée à `authenticated` (`0019_actuals_data_sources.sql`), à la différence de `load_units`
  // (chemin d'écriture unique, `finalizeSessionLogLoad()` plus bas, ADR-015 §1). Un code inconnu
  // du référentiel (jamais censé arriver, `SportCodeSchema` valide juste le FORMAT, pas
  // l'existence) laisse `sportId` à `null` plutôt que d'échouer bruyamment : la séance hors plan
  // reste enregistrable sans discipline reconnue (AC3 — jamais de blocage), au même titre qu'un
  // import Strava non cartographié (`external_sport_mappings`, ADR-013).
  let sportId: string | null = null;
  if (input.sportCode) {
    const { data: sportRow } = await rls.from("sports").select("id").eq("code", input.sportCode).maybeSingle();
    sportId = sportRow?.id ?? null;
  }

  // 1) Persistance du réalisé — client RLS (consentement santé vérifié en profondeur par la
  // policy `session_logs_insert_own`, pas seulement en amont dans le Route Handler).
  const { data: insertedLog, error: insertError } = await rls
    .from("session_logs")
    .insert({
      user_id: userId,
      planned_session_id: input.plannedSessionId,
      logged_date: input.loggedDate,
      sport_id: sportId,
      session_type: input.sessionType ?? null,
      started_at: input.startedAt ?? null,
      completion: input.completion,
      not_done_reason: input.notDoneReason ?? null,
      actual_duration_min: input.actualDurationMin ?? null,
      rpe: input.rpe ?? null,
      freshness: input.freshness ?? null,
      pain: input.pain,
      pain_zone: input.painZone ?? null,
      pain_at_rest: input.painAtRest ?? false,
      comment: input.comment ?? null,
    })
    .select("id")
    .single();
  if (insertError) throw new SessionLogPersistenceError(`applyDailyLog: session_logs — ${insertError.message}`);

  // US-02, ADR-015 §1/§2 — point de contact #1 de `08-architecture.md` §13.6 : charge réalisée
  // (chemin d'écriture unique, service_role) PUIS résolution de doublon (AC5). L'ordre importe :
  // `reconcileSessionLogs()` doit voir un `load_units` déjà posé sur CETTE ligne pour que
  // l'agrégat de la ligne portante (si elle change de ligne physique) reste cohérent dès la
  // prochaine lecture. Aucun des deux n'affecte l'ajustement synchrone de l'AC4 ci-dessous, qui
  // reste piloté par `input` (RPE/fraîcheur/douleur DÉCLARÉS dans CETTE requête), inchangé.
  await finalizeSessionLogLoad(admin, { logId: insertedLog.id, userId });
  const reconciliation = await reconcileSessionLogs(admin, { userId, logId: insertedLog.id });
  await refreshDataRegime(admin, userId);
  // AC7 — « recalculé à chaque nouvelle donnée pertinente » (ADR-014 §5). Volontairement APRÈS
  // `refreshDataRegime()` et AVANT le reste de la fonction (protocole douleur, ajustement AC4) :
  // le score ne conditionne ni n'est conditionné par eux (AC9, ADR-014 §6 — le score ne pilote
  // rien), l'ordre exact vis-à-vis d'eux est donc sans conséquence ; il est placé ici pour rester
  // au plus près des deux autres effets de bord du réalisé qu'il consomme.
  await recalculateHybridScoreQuietly(admin, { userId, now });

  const { data: activePlan, error: planError } = await admin
    .from("plans")
    .select("id, objective_id, current_version_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (planError) throw new Error(`applyDailyLog: plans — ${planError.message}`);
  if (!activePlan) {
    throw new NoActivePlanError("applyDailyLog: aucun plan actif — l'onboarding doit être terminé avant toute saisie (AC4).");
  }

  const ruleset = await getActiveRuleset(admin);
  const llmProvider = getLlmProvider();

  // Contexte reconstruit APRÈS l'insertion : `history.sessionLogs` inclut donc la saisie du jour
  // (nécessaire à `evaluatePainProtocol` et, si `regeneratePlan()` est appelé plus bas, à
  // `hasActiveNegativeSignal`). Le `trigger` posé ici est un placeholder neutre — ni
  // `evaluatePainProtocol` ni la construction du contexte ne le lisent ; seul `generatePlan()` en a
  // besoin, et `regeneratePlan()` reconstruit de toute façon son PROPRE contexte plus bas avec le
  // trigger réellement décidé.
  const { context } = await buildPlanningContext(admin, {
    userId,
    now,
    trigger: "negative_signal",
    objectiveId: activePlan.objective_id,
  });

  // 2) AC9 — protocole douleur, uniquement sur la zone concernée par CETTE saisie.
  let painProtocolResponse: CreateSessionLogResponse["painProtocol"] = { level: "none", zoneBlocked: false, referral: null };
  let painProtocolTriggersRegeneration = false;

  if (input.pain !== "none" && input.painZone) {
    const traceFactory = createTraceFactory(ruleset.version);
    const painResult = evaluatePainProtocol(context, ruleset, traceFactory);
    const zoneState = painResult.zoneStates.find((z) => z.zone === input.painZone);

    if (zoneState) {
      const { data: existingRow, error: existingRowError } = await admin
        .from("pain_episodes")
        .select("id, referral_issued")
        .eq("user_id", userId)
        .eq("zone", input.painZone)
        .is("resolved_at", null)
        .maybeSingle();
      if (existingRowError) throw new Error(`applyDailyLog: pain_episodes (lecture) — ${existingRowError.message}`);

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
        if (error) throw new Error(`applyDailyLog: pain_episodes (mise à jour) — ${error.message}`);
        painEpisodeId = existingRow.id;
      } else {
        const { data: created, error } = await admin
          .from("pain_episodes")
          .insert({
            user_id: userId,
            zone: input.painZone,
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
        if (error) throw new Error(`applyDailyLog: pain_episodes (création) — ${error.message}`);
        painEpisodeId = created.id;
      }

      // Trace + `engine_runs` dédiés (mirroir `persistObjectiveNegotiation`, `regenerate-plan.ts`) :
      // `evaluatePainProtocol` est une fonction moteur TOP-LEVEL distincte de `generatePlan()`
      // (`08-architecture.md` §4.1), sa décision mérite sa propre auditabilité même si aucune
      // régénération de plan n'est déclenchée (ex. niveau "light").
      const engineRunId = randomUUID();
      const { error: engineRunError } = await admin.from("engine_runs").insert({
        id: engineRunId,
        user_id: userId,
        trigger: "pain_protocol" satisfies PlanTrigger,
        ruleset_version: ruleset.version,
        input_snapshot_hash: `pain-protocol:${insertedLog.id}`,
        status: "succeeded",
        finished_at: new Date().toISOString(),
      });
      if (engineRunError) throw new Error(`applyDailyLog: engine_runs (douleur) — ${engineRunError.message}`);

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
      if (traceError) throw new Error(`applyDailyLog: decision_traces (douleur) — ${traceError.message}`);

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
      if (explanationError) throw new Error(`applyDailyLog: explanations (douleur) — ${explanationError.message}`);

      await admin.from("pain_episodes").update({ explanation_id: explanationId }).eq("id", painEpisodeId);

      painProtocolResponse = {
        level: zoneState.level,
        zoneBlocked: zoneState.zoneBlocked,
        // Message FIXE, jamais le texte rendu par le LLM/template — voir `pain-referral-messages.ts`.
        referral: zoneState.referralRequired
          ? { required: true, message: PAIN_REFERRAL_MESSAGES[zoneState.level === "acute" ? "acute" : "persistent"] }
          : null,
      };
      painProtocolTriggersRegeneration = zoneState.level === "persistent" || zoneState.level === "acute";
    }
  }

  // 3) AC4 — ajustement immédiat à la baisse. `pain_protocol` prime sur `negative_signal` quand les
  // deux sont vrais (même saisie) : c'est le trigger le plus spécifique/le plus sévère des deux.
  const trigger: PlanTrigger | null = painProtocolTriggersRegeneration
    ? "pain_protocol"
    : isNegativeSignal(input)
      ? "negative_signal"
      : null;

  let adjustment: CreateSessionLogResponse["adjustment"] = { applied: false, direction: "none", planVersionId: null, affectedDates: [], explanation: null };

  if (trigger) {
    const result = await regeneratePlan(admin, { userId, objectiveId: activePlan.objective_id, trigger, now });
    if (result.outcome === "plan_generated") {
      // Fenêtre détaillée régénérée par CE run — J → J+6 (`materializePlanVersion` §10, AC1).
      const affectedDates = Array.from({ length: 7 }, (_, i) => addDaysIso(now, i));

      // `progression.negative_signal_reduction` (`06-compute-weekly-load-target.ts`) est posée SANS
      // CONDITION dès que `trigger ∈ {negative_signal, pain_protocol}` (Lot L2) : toujours présente
      // ici, un seul point d'accroche fiable pour expliquer CET ajustement (par opposition aux
      // explications par séance/jour nutrition, déjà persistées ailleurs).
      const { data: reductionTraceRow, error: reductionTraceError } = await admin
        .from("decision_traces")
        .select("id, rule_id, rule_version, ruleset_version, category, is_hard_guardrail, scope, scope_ref_id, scope_ref_date, condition_expr, inputs_used, output, severity")
        .eq("plan_version_id", result.planVersionId)
        .eq("rule_id", "progression.negative_signal_reduction")
        .limit(1)
        .maybeSingle();
      if (reductionTraceError) throw new Error(`applyDailyLog: decision_traces (ajustement) — ${reductionTraceError.message}`);

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
        if (explanationError) throw new Error(`applyDailyLog: explanations (ajustement) — ${explanationError.message}`);
        explanation = { short: rendered.shortText, explanationId };
      }

      adjustment = { applied: true, direction: "decrease", planVersionId: result.planVersionId, affectedDates, explanation };
    }
  }

  // 4) Séance suivante — J+1, la journée déjà saisie ne se ré-affiche pas comme « à venir ».
  // Lit toujours la version ACTIVE la plus récente (déjà régénérée si `trigger` a fait basculer
  // `plans.current_version_id`, inchangée sinon).
  const { data: refreshedPlan, error: refreshedPlanError } = await admin
    .from("plans")
    .select("current_version_id")
    .eq("id", activePlan.id)
    .maybeSingle();
  if (refreshedPlanError) throw new Error(`applyDailyLog: plans (relecture) — ${refreshedPlanError.message}`);

  // `now: { date: now, time: "00:00" }` — approximation documentée : `applyDailyLog()` ne reçoit
  // que la date locale (`args.now: string`), jamais l'heure. Sans conséquence pratique ici : ce
  // `placement.canReportIncident` n'est qu'un aperçu de la séance de J+1 (`CreateSessionLogResponse.nextSession`),
  // jamais rendu par un bouton de signalement — la vraie porte d'entrée (`/plan/today`,
  // `/aujourdhui`) résout l'heure réelle via `nowPartsInTimezone()`.
  const nextSession = refreshedPlan?.current_version_id
    ? await fetchTodaySessionView(admin, {
        userId,
        planVersionId: refreshedPlan.current_version_id,
        date: addDaysIso(now, 1),
        now: { date: now, time: "00:00" },
        ruleset,
      })
    : null;

  return {
    logId: insertedLog.id,
    adjustment,
    painProtocol: painProtocolResponse,
    nextSession,
    reconciliation: { merged: reconciliation.merged, survivingLogId: reconciliation.survivingLogId },
  };
}
