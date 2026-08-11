import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { Database } from "@hybride/db";
import type { ExplanationDetailView, ProgressDiagnosisResponse, Ruleset } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { diffDaysIso } from "@/lib/dates";
import { getLlmProvider } from "@/lib/coach-llm-provider";
import { aggregateCompletedWeeks } from "@/lib/orchestration/aggregate-completed-weeks";
import { buildPlanningContext } from "@/lib/orchestration/build-planning-context";
import { getEntitlement } from "@/lib/entitlements";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { persistStagnationDiagnosis } from "@/lib/orchestration/persist-stagnation-diagnosis";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/** Fraîcheur maximale d'un diagnostic persisté (`stagnation_diagnoses`) pour être servi tel quel — un
 * peu plus qu'une semaine (le rituel dominical, ADR-011), pour couvrir un léger retard du job. */
const PERSISTED_DIAGNOSIS_MAX_AGE_DAYS = 9;

/**
 * `GET /api/v1/progress/diagnosis` — AC6, AC7 (`08-architecture.md` §6.5).
 *
 * Sert D'ABORD le diagnostic PERSISTÉ le plus récent (`stagnation_diagnoses`, écrit par
 * `runWeeklyReview()` chaque dimanche, ADR-011 §"Décision") s'il est encore frais
 * (`PERSISTED_DIAGNOSIS_MAX_AGE_DAYS`) — c'est la même valeur que celle affichée sur `/revision`
 * (AC5), jamais recalculée à la volée avec un risque de diverger de ce que le rituel hebdomadaire a
 * déjà montré à l'utilisateur (même rationale de stabilité qu'ADR-005 §4 pour `plan_diffs`).
 *
 * Corrections post-revue (finding I6) :
 *   - Idempotence : le repli « à la volée » (aucun diagnostic persisté encore disponible — premier
 *     accès avant le premier dimanche, ou job pas encore passé) appelait `evaluateStagnation()` ET
 *     RÉÉCRIVAIT `engine_runs`/`decision_traces`/`explanations` À CHAQUE requête `GET`, avec un
 *     appel LLM à chaque fois — une route de LECTURE qui n'était pas idempotente. Il persiste
 *     désormais réellement le résultat via `persistStagnationDiagnosis()` (partagée avec
 *     `runWeeklyReview()`, idempotente par construction, `unique(user_id, evaluated_on)`), puis
 *     relit ce qui vient d'être écrit — un second `GET` la même journée retombe directement sur le
 *     chemin « persisté », sans nouvel appel LLM ni nouvelle écriture. Corrige au passage
 *     `explanations.subject_id` qui pointait vers un `randomUUID()` sans ligne `stagnation_diagnoses`
 *     correspondante (bruit d'audit permanent) : `persistStagnationDiagnosis()` référence désormais
 *     la ligne réellement écrite.
 *   - Entitlement : cette route n'appelait ni `requireEntitlement()` ni `getEntitlement()` — un
 *     vecteur de coût LLM sans quota. Alignée sur `/plan/reviews/latest` (même famille d'insight
 *     approfondi, jamais consommateur d'accès libre) : réservée aux abonnés (`canViewWeek`).
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();

  const entitlement = await getEntitlement(admin, { userId: user.id, now });
  if (!entitlement.canViewWeek) {
    return apiError(402, "PAYWALL_REQUIRED", "Le diagnostic de progression détaillé est réservé aux abonnés.", { entitlement });
  }

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

  let persisted = await readPersistedDiagnosis(admin, { userId: user.id, now, ruleset });
  let weeksAvailableFallback = 0;

  if (!persisted) {
    const { context } = await buildPlanningContext(admin, {
      userId: user.id,
      now,
      trigger: "stagnation",
      objectiveId: activePlan.objective_id,
    });
    const completedWeeks = aggregateCompletedWeeks(context.history);
    weeksAvailableFallback = completedWeeks.length;
    const contextWithWeeks = { ...context, history: { ...context.history, completedWeeks } };

    await persistStagnationDiagnosis(admin, { userId: user.id, now, ruleset, context: contextWithWeeks, llmProvider: getLlmProvider() });
    persisted = await readPersistedDiagnosis(admin, { userId: user.id, now, ruleset });
  }

  if (persisted) return apiJson<ProgressDiagnosisResponse>(persisted, { headers: { "Cache-Control": "no-store" } });

  // `persistStagnationDiagnosis()` s'est dégradée silencieusement (ADR-007 : seuils `stagnation.*`
  // non configurés, légitime en dev) : même repli explicite qu'avant cette correction.
  const body: ProgressDiagnosisResponse = {
    status: "calibration",
    weeksAvailable: weeksAvailableFallback,
    weeksRequired: ruleset.params.stagnation.calibration_min_weeks,
    message: "Le coach ne peut pas encore se prononcer sur ta progression — réessaie plus tard.",
    confidence: "calibrating",
  };
  return apiJson<ProgressDiagnosisResponse>(body, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Lit le diagnostic `stagnation_diagnoses` le plus récent (écrit par `runWeeklyReview()` ou par
 * `persistStagnationDiagnosis()` appelée ci-dessus) et le traduit en `ProgressDiagnosisResponse`.
 * `null` si aucun diagnostic n'existe encore, ou si le plus récent est trop ancien
 * (`PERSISTED_DIAGNOSIS_MAX_AGE_DAYS`).
 */
async function readPersistedDiagnosis(
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; ruleset: Ruleset },
): Promise<ProgressDiagnosisResponse | null> {
  const { userId, now, ruleset } = args;

  const { data: row, error } = await admin
    .from("stagnation_diagnoses")
    .select("evaluated_on, weeks_available, status, indicator, diagnosis, evidence, recommended_action, explanation_id, plan_version_id")
    .eq("user_id", userId)
    .order("evaluated_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`readPersistedDiagnosis: stagnation_diagnoses — ${error.message}`);
  if (!row) return null;
  if (diffDaysIso(row.evaluated_on, now) > PERSISTED_DIAGNOSIS_MAX_AGE_DAYS) return null;

  const weeksRequired = ruleset.params.stagnation.calibration_min_weeks;

  if (row.status === "calibration") {
    return {
      status: "calibration",
      weeksAvailable: row.weeks_available,
      weeksRequired,
      message: `Le coach a besoin d'au moins ${weeksRequired} semaines de données comparables avant de pouvoir se prononcer sur ta progression — il ne peut pas encore conclure (phase de calibration).`,
      confidence: "calibrating",
    };
  }

  let explanation: ExplanationDetailView = { short: "", long: null, confidence: row.status === "stagnation" ? "high" : "high" };
  if (row.explanation_id) {
    const { data: explanationRow, error: explanationError } = await admin
      .from("explanations")
      .select("short_text, long_text, confidence")
      .eq("id", row.explanation_id)
      .maybeSingle();
    if (explanationError) throw new Error(`readPersistedDiagnosis: explanations — ${explanationError.message}`);
    if (explanationRow) {
      explanation = { short: explanationRow.short_text, long: explanationRow.long_text, confidence: explanationRow.confidence };
    }
  }

  const evidence = ((row.evidence as unknown as Array<{ label: string; current: number; previous: number }>) ?? []).map((e) => ({
    label: e.label,
    current: e.current,
    previous: e.previous,
  }));

  if (row.status === "no_stagnation") {
    return { status: "no_stagnation", indicators: evidence, explanation };
  }

  return {
    status: "stagnation",
    indicator: row.indicator ?? "unknown",
    diagnosis: row.diagnosis ?? "inconclusive",
    evidence,
    proposedAdaptation: { summary: row.recommended_action ?? "none", planVersionId: row.plan_version_id },
    explanation,
  };
}
