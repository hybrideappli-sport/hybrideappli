import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import { computeHybridScore, createTraceFactory } from "@hybride/rules-engine";
import type { HybridScoreContext, HybridScoreResponse, HybridScoreResult, PlanTrigger, Ruleset } from "@hybride/domain";

import { getLlmProvider } from "../coach-llm-provider";
import { addDaysIso } from "../dates";
import { resolveProvenance } from "../data/provenance";
import { canonicalHash } from "../orchestration/hash";
import { getActiveRuleset } from "../orchestration/get-active-ruleset";
import { renderExplanationForTraces } from "../orchestration/render-explanations";

const HYBRID_SCORE_TRIGGER: PlanTrigger = "hybrid_score";

/**
 * `computeAndStoreHybridScore()` — AC7/AC8/AC9, ADR-014 §5. Contexte étroit (`HybridScoreContext`,
 * pas `PlanningContext`) → fonction pure du moteur → persistance IDEMPOTENTE (`unique (user_id,
 * computed_for, inputs_digest)`, même patron que `plan_versions_idempotency`, ADR-005) →
 * explication rendue UNIQUEMENT pour `status = 'available'` (AC8 : aucun texte généré autour d'un
 * chiffre qui n'existe pas en calibration).
 *
 * Calcul PARESSEUX (ADR-014 §5) : appelée par `GET /api/v1/score/hybrid` ET après toute écriture
 * pertinente (`POST /session-logs`, import Strava) — jamais par un cron dédié.
 */
export async function computeAndStoreHybridScore(admin: SupabaseClient<Database>, args: { userId: string; now: string }): Promise<HybridScoreResponse> {
  const { userId, now } = args;

  const ruleset = await getActiveRuleset(admin);
  const params = ruleset.params.hybrid_score;

  const context = await buildHybridScoreContext(admin, userId, now, params.chronic_window_days);
  const result = computeHybridScore(context, ruleset, createTraceFactory(ruleset.version));

  const inputsDigest = canonicalHash({ context, rulesetVersion: ruleset.version });
  const provenance = await computeProvenanceCounts(admin, userId, result.windowStart, result.windowEnd);

  const persisted = await persistScore(admin, { userId, computedFor: now, ruleset, result, inputsDigest, provenance });

  // ADR-014 §2 — le delta est RECALCULÉ (jamais relu) sur une fenêtre décalée de `acute_window_days`
  // (7 j par défaut), uniquement pour un score 'available'.
  let delta: { value: number; since: string } | null = null;
  if (result.status === "available") {
    const sinceDate = addDaysIso(now, -params.acute_window_days);
    const previousContext = await buildHybridScoreContext(admin, userId, sinceDate, params.chronic_window_days);
    const previousResult = computeHybridScore(previousContext, ruleset, createTraceFactory(ruleset.version));
    if (previousResult.status === "available" && previousResult.score !== null) {
      delta = { value: result.score! - previousResult.score, since: sinceDate };
    }
  }

  return toResponse(result, ruleset.version, params, persisted.explanation, delta, provenance);
}

/**
 * Enrôle un recalcul APRÈS une écriture pertinente (`POST /session-logs`,
 * `POST /session-logs/:id/unmerge`, import Strava — ADR-014 §5, dernier paragraphe), SANS jamais
 * faire échouer l'appelant : le score hybride est un indicateur d'affichage, jamais une condition
 * de fonctionnement du coach (AC9). Une panne du calcul de score (ruleset `0.2.0-dev` absent, LLM
 * indisponible pour l'explication…) est journalisée, pas remontée.
 */
export async function recalculateHybridScoreQuietly(admin: SupabaseClient<Database>, args: { userId: string; now: string }): Promise<void> {
  try {
    await computeAndStoreHybridScore(admin, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[hybrid-score] recalcul silencieux échoué pour user=${args.userId} : ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Contexte — lecture `session_logs_counted` (fusions/exclusions déjà appliquées, ADR-015 §3)
// ---------------------------------------------------------------------------

async function buildHybridScoreContext(admin: SupabaseClient<Database>, userId: string, asOf: string, chronicWindowDays: number): Promise<HybridScoreContext> {
  const windowStart = addDaysIso(asOf, -(chronicWindowDays - 1));

  const [firstLoggedRes, sessionsRes] = await Promise.all([
    admin.from("session_logs_counted").select("logged_date").eq("user_id", userId).order("logged_date", { ascending: true }).limit(1).maybeSingle(),
    admin
      .from("session_logs_counted")
      .select("logged_date, sport_id, load_units, sports(code)")
      .eq("user_id", userId)
      .gte("logged_date", windowStart)
      .lte("logged_date", asOf),
  ]);
  if (firstLoggedRes.error) throw new Error(`computeAndStoreHybridScore: session_logs_counted (première date) — ${firstLoggedRes.error.message}`);
  if (sessionsRes.error) throw new Error(`computeAndStoreHybridScore: session_logs_counted (fenêtre) — ${sessionsRes.error.message}`);

  return {
    now: asOf,
    firstLoggedDate: firstLoggedRes.data?.logged_date ?? null,
    // `session_logs_counted` est une VUE : le générateur de types Supabase ne peut pas y propager la
    // contrainte `not null` de la table sous-jacente (`session_logs.logged_date`), donc `logged_date`
    // ressort `string | null` alors qu'il ne l'est jamais réellement. Filtre défensif plutôt qu'un
    // cast — n'exclut aucune ligne réelle, rassure uniquement le vérificateur de types.
    sessions: (sessionsRes.data ?? [])
      .filter((row): row is typeof row & { logged_date: string } => row.logged_date !== null)
      .map((row) => ({
        loggedDate: row.logged_date,
        sportId: row.sport_id,
        sportCode: (row.sports as unknown as { code: string } | null)?.code ?? null,
        loadUnits: row.load_units ?? 0,
      })),
  };
}

async function computeProvenanceCounts(
  admin: SupabaseClient<Database>,
  userId: string,
  windowStart: string,
  windowEnd: string,
): Promise<{ connected: number; declared: number }> {
  const { data, error } = await admin
    .from("session_logs_counted")
    .select("source, data_connections(status)")
    .eq("user_id", userId)
    .gte("logged_date", windowStart)
    .lte("logged_date", windowEnd);
  if (error) throw new Error(`computeAndStoreHybridScore: provenance — ${error.message}`);

  let connected = 0;
  let declared = 0;
  for (const row of data ?? []) {
    const status = (row.data_connections as unknown as { status: Database["public"]["Enums"]["data_connection_status"] } | null)?.status ?? null;
    // Même artefact de vue que `logged_date` ci-dessus : `source` porte `not null default 'declared'`
    // sur la table sous-jacente. Repli explicite et documenté plutôt qu'un cast aveugle.
    const source = row.source ?? "declared";
    if (resolveProvenance(source, status) === "synced") connected += 1;
    else declared += 1;
  }
  return { connected, declared };
}

// ---------------------------------------------------------------------------
// Persistance — idempotente, explication uniquement pour 'available'
// ---------------------------------------------------------------------------

interface PersistedScore {
  explanation: { short: string; explanationId: string } | null;
}

async function persistScore(
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    computedFor: string;
    ruleset: Ruleset;
    result: HybridScoreResult;
    inputsDigest: string;
    provenance: { connected: number; declared: number };
  },
): Promise<PersistedScore> {
  const { userId, computedFor, ruleset, result, inputsDigest, provenance } = args;

  const { data: existing, error: existingError } = await admin
    .from("hybrid_scores")
    .select("id, explanation_id")
    .eq("user_id", userId)
    .eq("computed_for", computedFor)
    .eq("inputs_digest", inputsDigest)
    .maybeSingle();
  if (existingError) throw new Error(`computeAndStoreHybridScore: lecture hybrid_scores (idempotence) — ${existingError.message}`);

  if (existing) {
    if (!existing.explanation_id) return { explanation: null };
    const { data: explanationRow, error: explanationError } = await admin
      .from("explanations")
      .select("short_text")
      .eq("id", existing.explanation_id)
      .maybeSingle();
    if (explanationError) throw new Error(`computeAndStoreHybridScore: lecture explanations — ${explanationError.message}`);
    return { explanation: explanationRow ? { short: explanationRow.short_text, explanationId: existing.explanation_id } : null };
  }

  const engineRunId = randomUUID();
  const { error: engineRunError } = await admin.from("engine_runs").insert({
    id: engineRunId,
    user_id: userId,
    trigger: HYBRID_SCORE_TRIGGER,
    ruleset_version: ruleset.version,
    input_snapshot_hash: inputsDigest,
    status: "succeeded",
    finished_at: new Date().toISOString(),
  });
  if (engineRunError) throw new Error(`computeAndStoreHybridScore: engine_runs — ${engineRunError.message}`);

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
  if (traceError) throw new Error(`computeAndStoreHybridScore: decision_traces — ${traceError.message}`);

  // Généré côté client pour pouvoir servir de `subject_id` à l'explication AVANT que la ligne
  // `hybrid_scores` elle-même n'existe (`explanations.subject_id` n'a pas de FK — champ
  // polymorphe, comme pour `pain_episode`/`plan_version` ailleurs dans le code).
  const scoreRowId = randomUUID();

  let explanationId: string | null = null;
  let explanationShort: string | null = null;
  if (result.status === "available") {
    const rendered = await renderExplanationForTraces(getLlmProvider(), { subjectType: "hybrid_score", traces: [result.trace] });
    explanationId = randomUUID();
    const { error: explanationError } = await admin.from("explanations").insert({
      id: explanationId,
      user_id: userId,
      subject_type: "hybrid_score",
      subject_id: scoreRowId,
      short_text: rendered.shortText,
      long_text: rendered.longText,
      generated_by: rendered.generatedBy,
      llm_model: rendered.llmModel,
      numeric_integrity_ok: rendered.numericIntegrityOk,
      fallback_used: rendered.fallbackUsed,
      confidence: "high",
      decision_trace_ids: [traceId],
    });
    if (explanationError) throw new Error(`computeAndStoreHybridScore: explanations — ${explanationError.message}`);
    explanationShort = rendered.shortText;
  }

  const { error: insertError } = await admin.from("hybrid_scores").insert({
    id: scoreRowId,
    user_id: userId,
    computed_for: computedFor,
    window_start: result.windowStart,
    window_end: result.windowEnd,
    status: result.status,
    score: result.score,
    components: result.components as unknown as Json,
    weeks_available: result.weeksAvailable,
    sessions_counted: result.sessionsCounted,
    disciplines_counted: result.disciplinesCounted,
    load_units_total: result.loadUnitsTotal,
    by_discipline: result.byDiscipline as unknown as Json,
    by_day: result.byDay as unknown as Json,
    provenance: provenance as unknown as Json,
    ruleset_version: ruleset.version,
    inputs_digest: inputsDigest,
    explanation_id: explanationId,
    engine_run_id: engineRunId,
  });
  if (insertError) throw new Error(`computeAndStoreHybridScore: hybrid_scores — ${insertError.message}`);

  return { explanation: explanationId && explanationShort ? { short: explanationShort, explanationId } : null };
}

// ---------------------------------------------------------------------------
// Vue API — `08-architecture.md` §13.3
// ---------------------------------------------------------------------------

function toResponse(
  result: HybridScoreResult,
  rulesetVersion: string,
  params: Ruleset["params"]["hybrid_score"],
  explanation: { short: string; explanationId: string } | null,
  delta: { value: number; since: string } | null,
  provenance: { connected: number; declared: number },
): HybridScoreResponse {
  const volume: HybridScoreResponse["volume"] = {
    totalLoadUnits: result.byDay.reduce((sum, day) => sum + day.loadUnits, 0),
    deltaPct: null, // question ouverte §7 de la fiche (format d'historique) — non calculé en V1.
    days: result.byDay,
  };

  const splitView = { items: result.byDiscipline.map((d) => ({ sportCode: d.sportCode, label: d.sportCode ?? "Non cartographié", sharePct: d.sharePct })) };

  if (result.status === "calibration") {
    return {
      status: "calibration",
      weeksAvailable: result.weeksAvailable,
      weeksRequired: result.weeksRequired,
      sessionsCounted: result.sessionsCounted,
      sessionsRequired: result.sessionsRequired,
      message: `Encore ${Math.max(0, result.weeksRequired - result.weeksAvailable)} semaine(s) de données avant ton premier score hybride.`,
      volume,
      split: result.byDiscipline.length > 0 ? splitView : null,
      nextStep: result.sessionsCounted === 0 ? { kind: "log_session", label: "Enregistrer une séance" } : { kind: "connect_sources", label: "Connecter une source" },
    };
  }

  return {
    status: "available",
    score: result.score!,
    delta,
    components: {
      volume: { normalized: result.components.volume.normalized, weight: params.weights.volume, raw: result.components.volume.raw, label: "Charge" },
      consistency: {
        normalized: result.components.consistency.normalized,
        weight: params.weights.consistency,
        raw: result.components.consistency.raw,
        label: "Régularité",
      },
      diversity: { normalized: result.components.diversity.normalized, weight: params.weights.diversity, raw: result.components.diversity.raw, label: "Diversité" },
    },
    basis: { sessions: result.sessionsCounted, disciplines: result.disciplinesCounted, windowDays: params.chronic_window_days },
    volume,
    split: splitView,
    provenance,
    explanation,
    rulesetVersion,
  };
}
