import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import { createTraceFactory, evaluateObjectiveFeasibility, generatePlan } from "@hybride/rules-engine";
import type { FeasibilityProposalView, PlanTrigger, TodayPlanView } from "@hybride/domain";

import { getLlmProvider } from "../coach-llm-provider";
import { placeAndMaterializeVersion } from "../planning/place-plan-version";
import { fetchCurrentPlacementBySessionId, toSessionPlacementView } from "../planning/read-session-placements";
import { buildPlanningContext } from "./build-planning-context";
import { getActiveRuleset } from "./get-active-ruleset";
import { materializePlanVersion } from "./materialize-plan-version";
import { renderExplanationForTraces } from "./render-explanations";

export type RegeneratePlanResult =
  | { outcome: "plan_generated"; planVersionId: string; today: TodayPlanView }
  | {
      outcome: "objective_negotiation";
      objectiveId: string;
      feasibility: "unrealistic";
      reasoning: { short: string; long: string; decisionTraceIds: string[] };
      proposals: FeasibilityProposalView[];
      canKeepOriginal: true;
    };

/**
 * `regeneratePlan()` — squelette commun des orchestrateurs (`08-architecture.md` §3.2, plan §6
 * étape 17) : charge le contexte → exécute le moteur → persiste la version + les traces → rend les
 * explications. Un seul point de bifurcation AC2, réservé au trigger `'onboarding'` : au-delà
 * (`objective_renegotiation`, …), l'utilisateur a déjà tranché — jamais une seconde négociation
 * silencieuse en boucle (voir `objective-feasibility.ts` du Lot L2, qui documente cette même
 * responsabilité côté moteur : « la bifurcation est une responsabilité de l'orchestrateur »).
 *
 * Contrairement au pseudo-code d'architecture, l'évaluation de faisabilité n'est PAS relue depuis
 * les traces de `generatePlan()` : `EngineResult` n'expose que `{status, trace}` (les propositions
 * de négociation de `FeasibilityResult.proposals` sont volontairement absorbées par
 * `resolveObjectiveFeasibility`, étape 3 du pipeline — voir son en-tête). Ce module appelle donc
 * `evaluateObjectiveFeasibility()` de façon autonome AVANT `generatePlan()` quand `trigger ===
 * 'onboarding'`, exactement comme `08-architecture.md` §4.1 l'expose en fonction top-level
 * séparée. Si l'objectif est réaliste, `generatePlan()` la recalculera en interne (déterministe,
 * donc sans divergence) — c'est un coût redondant assumé plutôt qu'une duplication d'API.
 */
export async function regeneratePlan(
  admin: SupabaseClient<Database>,
  args: { userId: string; objectiveId: string; trigger: PlanTrigger; now: string },
): Promise<RegeneratePlanResult> {
  const { userId, objectiveId, trigger, now } = args;

  const ruleset = await getActiveRuleset(admin);
  const llmProvider = getLlmProvider();
  const { context, hash } = await buildPlanningContext(admin, { userId, now, trigger, objectiveId });

  if (trigger === "onboarding") {
    const traceFactory = createTraceFactory(ruleset.version);
    const feasibility = evaluateObjectiveFeasibility(context, ruleset, traceFactory);

    if (feasibility.status === "unrealistic") {
      return persistObjectiveNegotiation(admin, {
        userId,
        objectiveId,
        trigger,
        rulesetVersion: ruleset.version,
        contextHash: hash,
        feasibility,
        llmProvider,
      });
    }
  }

  const engineResult = generatePlan(context, ruleset); // PUR — ADR-002

  const materialized = await materializePlanVersion(admin, {
    userId,
    objectiveId,
    trigger,
    ruleset,
    context,
    contextHash: hash,
    engineResult,
    llmProvider,
  });

  await admin
    .from("objectives")
    .update({ status: "active" })
    .eq("id", objectiveId);

  // US-03 — `materializeSessionPlacements()` tourne DANS LA MÊME LOGIQUE DE TRANSACTION, APRÈS
  // `materializePlanVersion()` (`08-architecture.md` §14.2). `trigger === 'onboarding'` est la
  // toute première version d'un plan pour cet objectif ⇒ `initial` ; toute autre régénération
  // (weekly_review, negative_signal, pain_protocol, objective_renegotiation…) écrit de nouvelles
  // lignes `planned_sessions` fraîches ⇒ `plan_regenerated` (ADR-016 §2). `time: "00:00"` : sans
  // conséquence ici, `isFreshWeek` (aucun placement existant à geler) ne consulte jamais l'heure.
  await placeAndMaterializeVersion(admin, {
    userId,
    planVersionId: materialized.planVersionId,
    now: { date: now, time: "00:00" },
    triggerReason: trigger === "onboarding" ? "initial" : "plan_regenerated",
    ruleset,
  });

  const todaySessionId = materialized.today.session?.id ?? null;
  const todayPlacement = todaySessionId
    ? await fetchCurrentPlacementBySessionId(admin, { userId, plannedSessionId: todaySessionId })
    : null;

  return {
    outcome: "plan_generated",
    planVersionId: materialized.planVersionId,
    today: {
      date: now,
      session:
        materialized.today.session && todayPlacement
          ? { ...materialized.today.session, placement: toSessionPlacementView(todayPlacement, { date: now, time: "00:00" }, ruleset) }
          : materialized.today.session,
      nutrition: materialized.today.nutrition,
    },
  };
}

async function persistObjectiveNegotiation(
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    objectiveId: string;
    trigger: PlanTrigger;
    rulesetVersion: string;
    contextHash: string;
    feasibility: ReturnType<typeof evaluateObjectiveFeasibility>;
    llmProvider: ReturnType<typeof getLlmProvider>;
  },
): Promise<RegeneratePlanResult> {
  const { userId, objectiveId, trigger, rulesetVersion, contextHash, feasibility, llmProvider } = args;

  const engineRunId = randomUUID();
  const { error: engineRunError } = await admin.from("engine_runs").insert({
    id: engineRunId,
    user_id: userId,
    trigger,
    ruleset_version: rulesetVersion,
    input_snapshot_hash: contextHash,
    status: "succeeded",
    finished_at: new Date().toISOString(),
  });
  if (engineRunError) throw new Error(`regeneratePlan: engine_runs (négociation) — ${engineRunError.message}`);

  const traceId = randomUUID();
  const { error: traceError } = await admin.from("decision_traces").insert({
    id: traceId,
    user_id: userId,
    engine_run_id: engineRunId,
    plan_version_id: null,
    ruleset_version: feasibility.trace.rulesetVersion,
    rule_id: feasibility.trace.ruleId,
    rule_version: feasibility.trace.ruleVersion,
    category: feasibility.trace.category,
    is_hard_guardrail: feasibility.trace.isHardGuardrail,
    scope: feasibility.trace.scope,
    scope_ref_id: feasibility.trace.scopeRefId,
    scope_ref_date: feasibility.trace.scopeRefDate,
    condition_expr: feasibility.trace.conditionExpr,
    inputs_used: feasibility.trace.inputsUsed as unknown as Json,
    output: feasibility.trace.output as unknown as Json,
    severity: feasibility.trace.severity,
  });
  if (traceError) throw new Error(`regeneratePlan: decision_traces (négociation) — ${traceError.message}`);

  const rendered = await renderExplanationForTraces(llmProvider, {
    subjectType: "objective_feasibility",
    traces: [feasibility.trace],
  });

  const explanationId = randomUUID();
  const { error: explanationError } = await admin.from("explanations").insert({
    id: explanationId,
    user_id: userId,
    subject_type: "objective_feasibility",
    subject_id: objectiveId,
    short_text: rendered.shortText,
    long_text: rendered.longText,
    generated_by: rendered.generatedBy,
    llm_model: rendered.llmModel,
    numeric_integrity_ok: rendered.numericIntegrityOk,
    fallback_used: rendered.fallbackUsed,
    confidence: "high",
    decision_trace_ids: [traceId],
  });
  if (explanationError) throw new Error(`regeneratePlan: explanations (négociation) — ${explanationError.message}`);

  // `proposed_alternative` conserve les propositions COMPLÈTES (avec `targetMetric`, nécessaire à
  // `negotiateObjective()` pour appliquer un choix côté serveur) — la vue client
  // (`FeasibilityProposalView`) est un sous-ensemble volontairement plus étroit construit juste en
  // dessous, uniquement pour la réponse HTTP.
  const { error: objectiveError } = await admin
    .from("objectives")
    .update({
      status: "active",
      feasibility: "unrealistic",
      feasibility_trace_id: traceId,
      proposed_alternative: { proposals: feasibility.proposals } as unknown as Json,
    })
    .eq("id", objectiveId);
  if (objectiveError) throw new Error(`regeneratePlan: objectives (négociation) — ${objectiveError.message}`);

  const proposals: FeasibilityProposalView[] = feasibility.proposals.map((proposal) => ({
    id: proposal.id,
    kind: proposal.kind,
    label: proposal.label,
    targetDate: proposal.targetDate,
    rationale: proposal.rationale,
  }));

  return {
    outcome: "objective_negotiation",
    objectiveId,
    feasibility: "unrealistic",
    reasoning: { short: rendered.shortText, long: rendered.longText, decisionTraceIds: [traceId] },
    proposals,
    canKeepOriginal: true,
  };
}
