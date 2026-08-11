import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import { diffPlanVersions, generatePlan } from "@hybride/rules-engine";
import type { DecisionTrace, PlanDiffItem, PlanSnapshot, StoredPlanDiffItem } from "@hybride/domain";

import { getLlmProvider } from "../coach-llm-provider";
import { notifyUser } from "../notifications/notify";
import { aggregateCompletedWeeks } from "./aggregate-completed-weeks";
import { buildPlanningContext } from "./build-planning-context";
import { getActiveRuleset } from "./get-active-ruleset";
import { materializePlanVersion } from "./materialize-plan-version";
import { persistStagnationDiagnosis } from "./persist-stagnation-diagnosis";
import { renderExplanationForTraces } from "./render-explanations";

export class NoActivePlanForReviewError extends Error {}

export type WeeklyReviewOutcome =
  | { outcome: "reviewed"; diffId: string; planVersionId: string }
  | { outcome: "no_active_plan" };

/**
 * `runWeeklyReview()` — le job dominical d'AC5/AC6/AC7 (`08-architecture.md` §7, ADR-011).
 * Exécuté par `POST /api/v1/cron/drain-jobs` pour chaque job `job_queue.kind = 'weekly_review'`.
 *
 * Séquence imposée par l'architecture :
 *   buildPlanningContext (avec `history.completedWeeks`, AC6/AC7)
 *   → evaluateStagnation → persistance `stagnation_diagnoses`
 *   → generatePlan(trigger='weekly_review')  ← seul trigger (avec `objective_renegotiation`) qui autorise une hausse
 *   → materializePlanVersion(isWeeklyBaseline=true)
 *   → diffPlanVersions(baseline N-1, baseline N) → plan_diffs
 *   → renderExplanations (résumé + par item, repli template si LLM en échec — ADR-011 §4)
 *   → notifyUser (push + e-mail Brevo + badge Dashboard)
 *
 * Un utilisateur sans plan actif (onboarding non terminé) sort proprement en `no_active_plan` :
 * ce n'est jamais une erreur, l'enrôlement (`/cron/enqueue-weekly-reviews`) ne filtre pas sur ce
 * critère (moins coûteux et plus robuste qu'une jointure supplémentaire côté cron).
 */
export async function runWeeklyReview(admin: SupabaseClient<Database>, args: { userId: string; now: string }): Promise<WeeklyReviewOutcome> {
  const { userId, now } = args;

  const { data: activePlan, error: planError } = await admin
    .from("plans")
    .select("id, objective_id, current_version_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (planError) throw new Error(`runWeeklyReview: plans — ${planError.message}`);
  if (!activePlan) return { outcome: "no_active_plan" };

  const ruleset = await getActiveRuleset(admin);
  const llmProvider = getLlmProvider();

  // Ligne de référence de la semaine PRÉCÉDENTE (ADR-005 §3) — lue AVANT de matérialiser la
  // nouvelle, pour ne jamais se comparer à elle-même.
  const { data: previousBaseline, error: previousBaselineError } = await admin
    .from("plan_versions")
    .select("id, snapshot")
    .eq("plan_id", activePlan.id)
    .eq("is_weekly_baseline", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousBaselineError) throw new Error(`runWeeklyReview: plan_versions (baseline précédente) — ${previousBaselineError.message}`);

  const { context, hash } = await buildPlanningContext(admin, { userId, now, trigger: "weekly_review", objectiveId: activePlan.objective_id });
  const completedWeeks = aggregateCompletedWeeks(context.history);

  // Correction post-revue (finding B2, 1/2) : `athlete_profiles.data_regime` avait pour défaut
  // `'cold'` (migration 0003) et n'était réécrit par AUCUN code — vérifié par grep exhaustif avant
  // cette correction. `buildPlanningContext()` laisse volontairement `history.completedWeeks = []`
  // (agrégat canonique réservé à ce job, voir son en-tête) : c'est donc ICI, et seulement ici, que
  // l'existence de semaines complétées devient connaissable. Dès qu'au moins une semaine agrégée
  // existe, on bascule le régime vers `'declared'` (AC12 — « la donnée déclarée suffit, la donnée
  // connectée enrichit ») : `computeBaselineWeeklyLoad()` (`06-compute-weekly-load-target.ts`) peut
  // alors enfin baser la charge de référence sur l'historique RÉEL plutôt que de la recalculer à
  // chaque fois depuis les heures déclarées à l'onboarding. Un régime déjà `'declared'`/`'connected'`
  // (F2) n'est jamais rétrogradé ici.
  const dataRegime = completedWeeks.length > 0 && context.dataRegime === "cold" ? "declared" : context.dataRegime;
  if (dataRegime !== context.dataRegime) {
    const { error: dataRegimeError } = await admin.from("athlete_profiles").update({ data_regime: dataRegime }).eq("user_id", userId);
    if (dataRegimeError) throw new Error(`runWeeklyReview: athlete_profiles (data_regime) — ${dataRegimeError.message}`);
  }

  const contextWithWeeks = { ...context, history: { ...context.history, completedWeeks }, dataRegime };

  // 1) AC6/AC7 — diagnostic de stagnation, persisté indépendamment de la régénération du plan
  // (fonction top-level distincte, `08-architecture.md` §4.1). Idempotent par construction
  // (`unique(user_id, evaluated_on)`) : un rejeu du job le même jour n'écrit pas deux fois.
  await persistStagnationDiagnosis(admin, { userId, now, ruleset, context: contextWithWeeks, llmProvider });

  // 2) AC5 — régénération hebdomadaire. `weekly_review` est un trigger `TRIGGERS_ALLOWING_INCREASE`
  // (`@hybride/domain`) : seul run (avec `objective_renegotiation`) capable de proposer une hausse
  // de charge — `generatePlan()` construit sa PROPRE fabrique de traces en interne.
  const engineResult = generatePlan(contextWithWeeks, ruleset);

  const materialized = await materializePlanVersion(admin, {
    userId,
    objectiveId: activePlan.objective_id,
    trigger: "weekly_review",
    ruleset,
    context: contextWithWeeks,
    contextHash: hash,
    engineResult,
    llmProvider,
    isWeeklyBaseline: true,
  });

  await admin.from("objectives").update({ status: "active" }).eq("id", activePlan.objective_id);

  // 3) AC5 — diff lisible entre les DEUX versions de référence.
  const fromSnapshot = (previousBaseline?.snapshot as unknown as PlanSnapshot | undefined) ?? null;
  const toSnapshot = engineResult.plan as unknown as PlanSnapshot;
  const diff = diffPlanVersions(fromSnapshot, toSnapshot);

  const tracesByLocalId = new Map<string, DecisionTrace>(engineResult.traces.map((t) => [t.id, t]));

  const storedItems: StoredPlanDiffItem[] = [];
  const allResolvedTraces: DecisionTrace[] = [];

  for (const item of diff.items) {
    const resolved = await resolveDiffItemTraces(admin, {
      item,
      tracesByLocalId,
      traceIdMap: materialized.traceIdMap,
      fromVersionId: previousBaseline?.id ?? null,
    });

    let explanationId: string | null = null;
    if (resolved.traces.length > 0) {
      const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "plan_diff_item", traces: resolved.traces });
      const { data: inserted, error } = await admin
        .from("explanations")
        .insert({
          user_id: userId,
          subject_type: "plan_diff_item",
          subject_id: materialized.planVersionId,
          short_text: rendered.shortText,
          long_text: rendered.longText,
          generated_by: rendered.generatedBy,
          llm_model: rendered.llmModel,
          numeric_integrity_ok: rendered.numericIntegrityOk,
          fallback_used: rendered.fallbackUsed,
          confidence: engineResult.confidence,
          decision_trace_ids: resolved.dbTraceIds,
        })
        .select("id")
        .single();
      if (error) throw new Error(`runWeeklyReview: explanations (diff item) — ${error.message}`);
      explanationId = inserted.id;
      allResolvedTraces.push(...resolved.traces);
    }

    storedItems.push({
      kind: item.kind,
      scope: item.scope,
      targetDate: item.targetDate,
      before: item.before,
      after: item.after,
      direction: item.direction,
      decisionTraceIds: resolved.dbTraceIds,
      explanationId,
    });
  }

  // 4) Explication de synthèse (`plan_diffs.summary_explanation_id`, ADR-005 §4) — à partir des
  // traces déjà résolues ; repli neutre si la semaine n'a produit aucun item exploitable (première
  // semaine, ou semaine strictement identique).
  const summaryTraces = allResolvedTraces.length > 0 ? allResolvedTraces : engineResult.traces.slice(0, 1);
  const summaryRendered = await renderExplanationForTraces(llmProvider, { subjectType: "plan_diff", traces: summaryTraces });

  const summaryExplanationId = randomUUID();
  const { error: summaryExplanationError } = await admin.from("explanations").insert({
    id: summaryExplanationId,
    user_id: userId,
    subject_type: "plan_diff",
    subject_id: materialized.planVersionId,
    short_text: summaryRendered.shortText,
    long_text: summaryRendered.longText,
    generated_by: summaryRendered.generatedBy,
    llm_model: summaryRendered.llmModel,
    numeric_integrity_ok: summaryRendered.numericIntegrityOk,
    fallback_used: summaryRendered.fallbackUsed,
    confidence: engineResult.confidence,
    decision_trace_ids: summaryTraces.map((t) => materialized.traceIdMap.get(t.id) ?? t.id).filter((id) => id.length > 0),
  });
  if (summaryExplanationError) throw new Error(`runWeeklyReview: explanations (résumé) — ${summaryExplanationError.message}`);

  const { data: diffRow, error: diffError } = await admin
    .from("plan_diffs")
    .insert({
      user_id: userId,
      plan_id: activePlan.id,
      from_version_id: previousBaseline?.id ?? null,
      to_version_id: materialized.planVersionId,
      items: storedItems as unknown as Json,
      summary_explanation_id: summaryExplanationId,
    })
    .select("id")
    .single();
  if (diffError) throw new Error(`runWeeklyReview: plan_diffs — ${diffError.message}`);

  // 5) AC5, ADR-011 §5 — notification triple canal, jamais bloquante.
  await notifyUser(admin, {
    userId,
    type: "weekly_review_ready",
    title: "Ta semaine est prête",
    body: summaryRendered.shortText,
    deepLink: "/revision",
  });

  return { outcome: "reviewed", diffId: diffRow.id, planVersionId: materialized.planVersionId };
}

/**
 * Traduit `PlanDiffItem.decisionTraceIds` (locaux au run qui les a produits — voir
 * `packages/rules-engine/src/lib/trace.ts`) en `decision_traces.id` réels.
 *
 * La majorité des items (`session_added`/`session_modified`/`week_load_changed`/…) portent des
 * `traceIds` du run COURANT (`to`), traduits directement via `traceIdMap`
 * (`materializePlanVersion()`, Lot L5). Le seul cas contraire est `session_removed`, dont
 * `diffPlanVersions()` recopie `beforeSession.traceIds` — locaux au run PRÉCÉDENT, dont la table
 * de correspondance n'a pas survécu (elle n'a jamais été persistée, seul `decision_traces` l'a
 * été). Repli best-effort documenté ici : recherche par `plan_version_id`/`scope_ref_date` — un
 * item sans trace résolue voit `explanationId = null` plutôt qu'un texte halluciné ou une erreur.
 */
async function resolveDiffItemTraces(
  admin: SupabaseClient<Database>,
  args: {
    item: PlanDiffItem;
    tracesByLocalId: Map<string, DecisionTrace>;
    traceIdMap: Map<string, string>;
    fromVersionId: string | null;
  },
): Promise<{ dbTraceIds: string[]; traces: DecisionTrace[] }> {
  const { item, tracesByLocalId, traceIdMap, fromVersionId } = args;

  const currentRunTraces = item.decisionTraceIds
    .map((localId) => tracesByLocalId.get(localId))
    .filter((t): t is DecisionTrace => t !== undefined);

  if (currentRunTraces.length > 0) {
    const dbTraceIds = currentRunTraces.map((t) => traceIdMap.get(t.id)).filter((id): id is string => id !== undefined);
    return { dbTraceIds, traces: currentRunTraces };
  }

  if (item.kind !== "session_removed" || !fromVersionId || !item.targetDate) {
    return { dbTraceIds: [], traces: [] };
  }

  const { data: rows, error } = await admin
    .from("decision_traces")
    .select("id, rule_id, rule_version, ruleset_version, category, is_hard_guardrail, scope, scope_ref_id, scope_ref_date, condition_expr, inputs_used, output, severity")
    .eq("plan_version_id", fromVersionId)
    .eq("scope_ref_date", item.targetDate)
    .limit(5);
  if (error) throw new Error(`resolveDiffItemTraces: decision_traces (repli session_removed) — ${error.message}`);
  if (!rows || rows.length === 0) return { dbTraceIds: [], traces: [] };

  const traces: DecisionTrace[] = rows.map((row) => ({
    id: row.id,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    rulesetVersion: row.ruleset_version,
    category: row.category as DecisionTrace["category"],
    isHardGuardrail: row.is_hard_guardrail,
    scope: row.scope as DecisionTrace["scope"],
    scopeRefId: row.scope_ref_id,
    scopeRefDate: row.scope_ref_date,
    conditionExpr: row.condition_expr,
    inputsUsed: row.inputs_used as unknown as DecisionTrace["inputsUsed"],
    output: row.output as unknown as DecisionTrace["output"],
    severity: row.severity as DecisionTrace["severity"],
  }));

  return { dbTraceIds: rows.map((r) => r.id), traces };
}
