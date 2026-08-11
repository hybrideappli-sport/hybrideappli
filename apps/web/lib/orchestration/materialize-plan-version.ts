import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import type { LlmProvider } from "@hybride/coach-llm";
import type { DecisionTrace, EngineResult, PlanningContext, PlanTrigger, Ruleset } from "@hybride/domain";

import { renderExplanationForTraces } from "./render-explanations";

/**
 * `materializePlanVersion()` — SEUL chemin d'écriture de la projection du plan (ADR-004 §2,
 * `plans/US-01-...md` §6 étape 17). Persiste `plans`/`plan_versions`/`plan_blocks`/`plan_weeks`/
 * `planned_sessions`/`nutrition_days`/`decision_traces`, rend puis persiste les `explanations` de
 * la fenêtre détaillée (J → J+6), et clôture `engine_runs`.
 *
 * Limite connue assumée (à documenter dans le rapport de fin de lot) : Supabase-js (client
 * PostgREST) n'expose pas de transaction multi-tables depuis le runtime applicatif — chaque étape
 * ci-dessous est un appel séquentiel avec le client `service_role`, PAS une transaction unique
 * comme le suggère le pseudo-code `db.transaction()` de `08-architecture.md` §3.2. Un échec
 * partiel laisserait des lignes orphelines (`engine_runs.status` resterait `'running'`, détectable
 * et rejouable). Une vraie garantie transactionnelle demanderait une fonction Postgres dédiée
 * (`security definer`) portant l'ensemble de l'écriture — hors budget de ce lot.
 */

type PlannedSessionInsert = Database["public"]["Tables"]["planned_sessions"]["Insert"];
type NutritionDayInsert = Database["public"]["Tables"]["nutrition_days"]["Insert"];

export interface MaterializedToday {
  session:
    | {
        id: string;
        sportCode: string | null;
        sessionType: string;
        durationMin: number | null;
        loadUnits: number;
        intensityZone: string | null;
        prescription: { warmup: string; body: string; cooldown: string } | null;
        interferenceNote: string | null;
        explanation: { short: string; explanationId: string };
        /** AC4 — jamais de réalisé au moment même de la génération du plan (Lot L4 lit/écrit ce champ). */
        log: null;
      }
    | null;
  nutrition:
    | {
        kcalTarget: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        modulationReason: string;
        advice: { pre: string; during: string; post: string };
        explanation: { short: string; explanationId: string };
        checkin: null;
      }
    | null;
}

export interface MaterializePlanVersionResult {
  planId: string;
  planVersionId: string;
  today: MaterializedToday;
  /**
   * `DecisionTrace.id` LOCAL (au run, `trace-N` — voir `packages/rules-engine/src/lib/trace.ts`)
   * → `decision_traces.id` réellement persisté par CE run. Nécessaire à `runWeeklyReview()`
   * (Lot L5) pour traduire les `PlanDiffItem.decisionTraceIds` de `diffPlanVersions()` (locaux à
   * `engineResult`) en identifiants de base référençables depuis `plan_diffs.items` — cette table
   * survit AU-DELÀ du run qui l'a produite, contrairement aux identifiants locaux.
   */
  traceIdMap: Map<string, string>;
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export async function materializePlanVersion(
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    objectiveId: string;
    trigger: PlanTrigger;
    ruleset: Ruleset;
    context: PlanningContext;
    contextHash: string;
    engineResult: EngineResult;
    llmProvider: LlmProvider;
    /**
     * AC5, ADR-005 §3 — marque cette version comme la version de RÉFÉRENCE de la semaine (le
     * repère utilisé par `diffPlanVersions()` : « toujours calculé entre la version de référence
     * de la semaine N-1 et celle de la semaine N »). `false` par défaut : seul `runWeeklyReview()`
     * (Lot L5) le pose à `true` — un ajustement immédiat (`negative_signal`/`pain_protocol`) ne
     * redéfinit JAMAIS la ligne de base, même s'il crée une nouvelle version.
     */
    isWeeklyBaseline?: boolean;
  },
): Promise<MaterializePlanVersionResult> {
  const { userId, objectiveId, trigger, ruleset, context, contextHash, engineResult, llmProvider, isWeeklyBaseline = false } = args;
  const { plan, traces } = engineResult;

  // 1) `plans` — un seul plan actif par utilisateur (index `plans_one_active_per_user`).
  const { data: existingPlan, error: existingPlanError } = await admin
    .from("plans")
    .select("id, current_version_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (existingPlanError) throw new Error(`materializePlanVersion: plans (lookup) — ${existingPlanError.message}`);

  let planId: string;
  if (existingPlan) {
    planId = existingPlan.id;
  } else {
    const { data: insertedPlan, error: insertPlanError } = await admin
      .from("plans")
      .insert({ user_id: userId, objective_id: objectiveId, started_on: context.now, status: "active" })
      .select("id")
      .single();
    if (insertPlanError) throw new Error(`materializePlanVersion: plans (insert) — ${insertPlanError.message}`);
    planId = insertedPlan.id;
  }

  // 2) numéro de version suivant (append-only, ADR-005).
  const { data: lastVersion, error: lastVersionError } = await admin
    .from("plan_versions")
    .select("version_number")
    .eq("plan_id", planId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastVersionError) throw new Error(`materializePlanVersion: plan_versions (lookup) — ${lastVersionError.message}`);
  const versionNumber = (lastVersion?.version_number ?? 0) + 1;

  // 3) `engine_runs` — ouvert avant l'écriture de la projection (auditabilité).
  const engineRunId = randomUUID();
  const { error: engineRunError } = await admin.from("engine_runs").insert({
    id: engineRunId,
    user_id: userId,
    trigger,
    ruleset_version: ruleset.version,
    input_snapshot_hash: contextHash,
    status: "running",
  });
  if (engineRunError) throw new Error(`materializePlanVersion: engine_runs — ${engineRunError.message}`);

  // 4) `plan_versions` — immuable (ADR-005).
  const planVersionId = randomUUID();
  const { error: planVersionError } = await admin.from("plan_versions").insert({
    id: planVersionId,
    plan_id: planId,
    user_id: userId,
    version_number: versionNumber,
    trigger,
    supersedes_version_id: existingPlan?.current_version_id ?? null,
    is_weekly_baseline: isWeeklyBaseline,
    ruleset_version: ruleset.version,
    engine_run_id: engineRunId,
    input_snapshot: context as unknown as Json,
    input_snapshot_hash: contextHash,
    snapshot: plan as unknown as Json,
    horizon_start: plan.horizonStart,
    horizon_end: plan.horizonEnd,
  });
  if (planVersionError) throw new Error(`materializePlanVersion: plan_versions — ${planVersionError.message}`);

  // 5) `plan_blocks` — macro.
  const blockIdByIndex = new Map<number, string>();
  const blockRows = plan.blocks.map((block) => {
    const id = randomUUID();
    blockIdByIndex.set(block.blockIndex, id);
    return {
      id,
      plan_version_id: planVersionId,
      user_id: userId,
      block_index: block.blockIndex,
      block_type: block.blockType,
      start_date: block.startDate,
      end_date: block.endDate,
      focus: block.focus,
      target_load_units: block.targetLoadUnits,
    };
  });
  if (blockRows.length > 0) {
    const { error } = await admin.from("plan_blocks").insert(blockRows);
    if (error) throw new Error(`materializePlanVersion: plan_blocks — ${error.message}`);
  }

  // 6) `plan_weeks` — méso/micro, couvre tout l'horizon (ADR-004 §3).
  const weekIdByStart = new Map<string, string>();
  const weekRows = plan.weeks.map((week) => {
    const id = randomUUID();
    weekIdByStart.set(week.weekStart, id);
    return {
      id,
      plan_version_id: planVersionId,
      plan_block_id: blockIdByIndex.get(week.blockIndex) ?? null,
      user_id: userId,
      week_start: week.weekStart,
      iso_week: week.isoWeek,
      detail_level: week.detailLevel,
      is_deload: week.isDeload,
      target_load_units: week.targetLoadUnits,
      planned_intense_sessions: week.plannedIntenseSessions,
      max_consecutive_days_without_rest: week.maxConsecutiveDaysWithoutRest,
    };
  });
  if (weekRows.length > 0) {
    const { error } = await admin.from("plan_weeks").insert(weekRows);
    if (error) throw new Error(`materializePlanVersion: plan_weeks — ${error.message}`);
  }

  // Les semaines couvrent l'horizon SANS TROU, par pas de 7 jours à partir de `weeks[0].weekStart`
  // (pipeline 04) : la semaine d'une date se déduit par arithmétique plutôt que par recherche.
  const sortedWeeks = [...plan.weeks].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  function weekIdForDate(date: string): string | null {
    if (sortedWeeks.length === 0) return null;
    const index = Math.floor(diffDays(sortedWeeks[0]!.weekStart, date) / 7);
    const week = sortedWeeks[index];
    return week ? (weekIdByStart.get(week.weekStart) ?? null) : null;
  }

  // 7) `planned_sessions` — J → J+13 (détail J→J+6, intention J+7→J+13).
  const sessionIdByDate = new Map<string, string>();
  const sessionRows: PlannedSessionInsert[] = [];
  for (const session of plan.sessions) {
    const id = randomUUID();
    sessionIdByDate.set(session.scheduledDate, id);
    const planWeekId = weekIdForDate(session.scheduledDate);
    if (!planWeekId) continue; // défensif : ne devrait jamais arriver (semaines contiguës, §04)
    sessionRows.push({
      id,
      plan_version_id: planVersionId,
      plan_week_id: planWeekId,
      user_id: userId,
      sport_id: null, // résolu par code via `sports` — Lot L4 (lecture) ; le code reste dans `interference_note`/logs si besoin
      scheduled_date: session.scheduledDate,
      slot: session.slot,
      order_in_day: session.orderInDay,
      session_type: session.sessionType,
      detail_level: session.detailLevel,
      duration_min: session.durationMin,
      load_units: session.loadUnits,
      intensity_zone: session.intensityZone,
      prescription: session.prescription as unknown as Json,
      muscle_groups: session.muscleGroups,
      interference_note: session.interferenceNote,
    });
  }
  if (sessionRows.length > 0) {
    const { error } = await admin.from("planned_sessions").insert(sessionRows);
    if (error) throw new Error(`materializePlanVersion: planned_sessions — ${error.message}`);
  }

  // 8) `nutrition_days` — uniquement J → J+6 (AC11).
  const nutritionIdByDate = new Map<string, string>();
  const nutritionRows: NutritionDayInsert[] = [];
  for (const day of plan.nutritionDays) {
    const id = randomUUID();
    nutritionIdByDate.set(day.date, id);
    const planWeekId = weekIdForDate(day.date);
    if (!planWeekId) continue;
    nutritionRows.push({
      id,
      plan_version_id: planVersionId,
      plan_week_id: planWeekId,
      user_id: userId,
      date: day.date,
      modulation_reason: day.modulationReason,
      kcal_target: day.kcalTarget,
      kcal_safety_floor: day.kcalSafetyFloor,
      protein_g: day.proteinG,
      carbs_g: day.carbsG,
      fat_g: day.fatG,
      hydration_ml: day.hydrationMl,
      advice_pre: day.advicePre,
      advice_during: day.adviceDuring,
      advice_post: day.advicePost,
    });
  }
  if (nutritionRows.length > 0) {
    const { error } = await admin.from("nutrition_days").insert(nutritionRows);
    if (error) throw new Error(`materializePlanVersion: nutrition_days — ${error.message}`);
  }

  // 9) `decision_traces` — immuable (ADR-006). `id` généré ici (pas par défaut base) pour pouvoir
  // faire le lien local trace.id → id persisté SANS dépendre de l'ordre de retour de l'INSERT.
  const dbTraceIdByLocalId = new Map<string, string>();
  const traceRows = traces.map((trace) => {
    const id = randomUUID();
    dbTraceIdByLocalId.set(trace.id, id);
    return {
      id,
      user_id: userId,
      engine_run_id: engineRunId,
      plan_version_id: planVersionId,
      ruleset_version: trace.rulesetVersion,
      rule_id: trace.ruleId,
      rule_version: trace.ruleVersion,
      category: trace.category,
      is_hard_guardrail: trace.isHardGuardrail,
      scope: trace.scope,
      scope_ref_id: trace.scopeRefId,
      scope_ref_date: trace.scopeRefDate,
      condition_expr: trace.conditionExpr,
      inputs_used: trace.inputsUsed as unknown as Json,
      output: trace.output as unknown as Json,
      severity: trace.severity,
    };
  });
  if (traceRows.length > 0) {
    const { error } = await admin.from("decision_traces").insert(traceRows);
    if (error) throw new Error(`materializePlanVersion: decision_traces — ${error.message}`);
  }

  const tracesByLocalId = new Map<string, DecisionTrace>(traces.map((t) => [t.id, t]));
  function tracesFor(localIds: string[]): DecisionTrace[] {
    return localIds.map((id) => tracesByLocalId.get(id)).filter((t): t is DecisionTrace => t !== undefined);
  }

  // 10) `explanations` — fenêtre détaillée UNIQUEMENT (J → J+6, AC1) : c'est elle qui alimente
  // `/plan/today` (Lot L4) et le récapitulatif retourné par `/complete`. Les jours J+7→J+13
  // (intention, sans prescription) et la vue macro n'ont pas d'explication pré-générée dans ce
  // lot — voir le rapport de fin de lot (question ouverte).
  const detailedSessions = plan.sessions.filter((s) => s.detailLevel === "detailed");

  const [sessionExplanations, nutritionExplanations] = await Promise.all([
    Promise.all(
      detailedSessions.map(async (session) => {
        const relevant = tracesFor(session.traceIds);
        const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "planned_session", traces: relevant });
        return { date: session.scheduledDate, rendered, traceIds: relevant.map((t) => dbTraceIdByLocalId.get(t.id)!) };
      }),
    ),
    Promise.all(
      plan.nutritionDays.map(async (day) => {
        const relevant = tracesFor(day.traceIds);
        const rendered = await renderExplanationForTraces(llmProvider, { subjectType: "nutrition_day", traces: relevant });
        return { date: day.date, rendered, traceIds: relevant.map((t) => dbTraceIdByLocalId.get(t.id)!) };
      }),
    ),
  ]);

  type ExplanationInsert = Database["public"]["Tables"]["explanations"]["Insert"];

  const explanationIdBySessionDate = new Map<string, { id: string; short: string }>();
  const explanationRows: ExplanationInsert[] = sessionExplanations.map((entry) => {
    const explanationId = randomUUID();
    explanationIdBySessionDate.set(entry.date, { id: explanationId, short: entry.rendered.shortText });
    return {
      id: explanationId,
      user_id: userId,
      subject_type: "planned_session",
      subject_id: sessionIdByDate.get(entry.date)!,
      short_text: entry.rendered.shortText,
      long_text: entry.rendered.longText,
      generated_by: entry.rendered.generatedBy,
      llm_model: entry.rendered.llmModel,
      numeric_integrity_ok: entry.rendered.numericIntegrityOk,
      fallback_used: entry.rendered.fallbackUsed,
      confidence: engineResult.confidence,
      decision_trace_ids: entry.traceIds,
    };
  });

  const explanationIdByNutritionDate = new Map<string, { id: string; short: string }>();
  for (const entry of nutritionExplanations) {
    const explanationId = randomUUID();
    explanationIdByNutritionDate.set(entry.date, { id: explanationId, short: entry.rendered.shortText });
    explanationRows.push({
      id: explanationId,
      user_id: userId,
      subject_type: "nutrition_day",
      subject_id: nutritionIdByDate.get(entry.date)!,
      short_text: entry.rendered.shortText,
      long_text: entry.rendered.longText,
      generated_by: entry.rendered.generatedBy,
      llm_model: entry.rendered.llmModel,
      numeric_integrity_ok: entry.rendered.numericIntegrityOk,
      fallback_used: entry.rendered.fallbackUsed,
      confidence: engineResult.confidence,
      decision_trace_ids: entry.traceIds,
    });
  }

  if (explanationRows.length > 0) {
    const { error } = await admin.from("explanations").insert(explanationRows);
    if (error) throw new Error(`materializePlanVersion: explanations — ${error.message}`);

    // Rattache chaque séance/jour nutrition à son explication (colonnes nullable — pas de cycle
    // à l'insertion, seulement à cette étape de mise à jour).
    await Promise.all([
      ...[...explanationIdBySessionDate.entries()].map(([date, { id }]) => {
        const sessionId = sessionIdByDate.get(date);
        return sessionId ? admin.from("planned_sessions").update({ explanation_id: id }).eq("id", sessionId) : Promise.resolve();
      }),
      ...[...explanationIdByNutritionDate.entries()].map(([date, { id }]) => {
        const nutritionId = nutritionIdByDate.get(date);
        return nutritionId ? admin.from("nutrition_days").update({ explanation_id: id }).eq("id", nutritionId) : Promise.resolve();
      }),
    ]);
  }

  // 11) clôture de `plans`/`engine_runs`.
  await admin.from("plans").update({ current_version_id: planVersionId }).eq("id", planId);
  await admin
    .from("engine_runs")
    .update({ status: "succeeded", output_plan_version_id: planVersionId, finished_at: new Date().toISOString() })
    .eq("id", engineRunId);

  // Réponse « aujourd'hui » (AC1) — construite directement depuis le `PlanDraft` en mémoire.
  const todaySessionDraft = plan.sessions.find((s) => s.scheduledDate === context.now) ?? null;
  const todayNutritionDraft = plan.nutritionDays.find((d) => d.date === context.now) ?? null;

  const today: MaterializedToday = {
    session:
      todaySessionDraft && explanationIdBySessionDate.has(context.now)
        ? {
            id: sessionIdByDate.get(context.now)!,
            sportCode: todaySessionDraft.sportCode,
            sessionType: todaySessionDraft.sessionType,
            durationMin: todaySessionDraft.durationMin,
            loadUnits: todaySessionDraft.loadUnits,
            intensityZone: todaySessionDraft.intensityZone,
            prescription: todaySessionDraft.prescription,
            interferenceNote: todaySessionDraft.interferenceNote,
            explanation: {
              short: explanationIdBySessionDate.get(context.now)!.short,
              explanationId: explanationIdBySessionDate.get(context.now)!.id,
            },
            log: null,
          }
        : null,
    nutrition:
      todayNutritionDraft && explanationIdByNutritionDate.has(context.now)
        ? {
            kcalTarget: todayNutritionDraft.kcalTarget,
            proteinG: todayNutritionDraft.proteinG,
            carbsG: todayNutritionDraft.carbsG,
            fatG: todayNutritionDraft.fatG,
            modulationReason: todayNutritionDraft.modulationReason,
            advice: { pre: todayNutritionDraft.advicePre, during: todayNutritionDraft.adviceDuring, post: todayNutritionDraft.advicePost },
            explanation: {
              short: explanationIdByNutritionDate.get(context.now)!.short,
              explanationId: explanationIdByNutritionDate.get(context.now)!.id,
            },
            checkin: null,
          }
        : null,
  };

  return { planId, planVersionId, today, traceIdMap: dbTraceIdByLocalId };
}
