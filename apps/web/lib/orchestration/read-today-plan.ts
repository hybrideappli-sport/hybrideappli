import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { ExplanationView, NutritionCheckinSummary, PainNoticeView, SessionLogSummary, TodayNutritionView, TodaySessionView } from "@hybride/domain";

import { PAIN_REFERRAL_MESSAGES } from "../pain-referral-messages";

/**
 * Lectures partagées de la projection du plan pour une date donnée — utilisées par `GET
 * /plan/today` et par `applyDailyLog()` (`nextSession`, Lot L4). Volontairement séparé de
 * `materialize-plan-version.ts` (le SEUL chemin d'ÉCRITURE, ADR-004) : ce module ne fait QUE lire.
 */

export async function getActivePlanVersionId(admin: SupabaseClient<Database>, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("plans").select("current_version_id").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw new Error(`readTodayPlan: plans — ${error.message}`);
  return data?.current_version_id ?? null;
}

async function fetchExplanationView(admin: SupabaseClient<Database>, explanationId: string): Promise<ExplanationView | null> {
  const { data, error } = await admin.from("explanations").select("short_text").eq("id", explanationId).maybeSingle();
  if (error) throw new Error(`readTodayPlan: explanations — ${error.message}`);
  if (!data) return null;
  return { short: data.short_text, explanationId };
}

async function fetchSessionLogSummary(admin: SupabaseClient<Database>, userId: string, date: string): Promise<SessionLogSummary | null> {
  // Au plus une saisie « la plus récente » retenue par jour (pas de contrainte unique en base —
  // un utilisateur honnête ne soumet qu'une fois, mais rien n'interdit une correction ultérieure).
  const { data, error } = await admin
    .from("session_logs")
    .select("id, completion, actual_duration_min, rpe, freshness, pain, pain_zone, pain_at_rest, comment")
    .eq("user_id", userId)
    .eq("logged_date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`readTodayPlan: session_logs — ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    completion: data.completion,
    actualDurationMin: data.actual_duration_min,
    rpe: data.rpe,
    freshness: data.freshness,
    pain: data.pain,
    painZone: data.pain_zone,
    painAtRest: data.pain_at_rest,
    comment: data.comment,
  };
}

async function fetchNutritionCheckinSummary(admin: SupabaseClient<Database>, userId: string, date: string): Promise<NutritionCheckinSummary | null> {
  const { data, error } = await admin
    .from("nutrition_checkins")
    .select("id, adherence, energy, comment")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`readTodayPlan: nutrition_checkins — ${error.message}`);
  if (!data) return null;
  return { id: data.id, adherence: data.adherence, energy: data.energy, comment: data.comment };
}

/**
 * `session: null` = état vide « jour de repos », explicite (`04-flow.md`) : le moteur n'a
 * simplement rien planifié ce jour-là — ce n'est jamais une erreur.
 */
export async function fetchTodaySessionView(
  admin: SupabaseClient<Database>,
  args: { userId: string; planVersionId: string; date: string },
): Promise<TodaySessionView | null> {
  const { userId, planVersionId, date } = args;
  const { data: row, error } = await admin
    .from("planned_sessions")
    .select("id, session_type, duration_min, load_units, intensity_zone, prescription, interference_note, explanation_id, sports(code)")
    .eq("plan_version_id", planVersionId)
    .eq("scheduled_date", date)
    .maybeSingle();
  if (error) throw new Error(`readTodayPlan: planned_sessions — ${error.message}`);
  if (!row) return null;

  const explanation = row.explanation_id ? await fetchExplanationView(admin, row.explanation_id) : null;
  const log = await fetchSessionLogSummary(admin, userId, date);
  const sportRef = row.sports as unknown as { code: string } | null;

  return {
    id: row.id,
    sportCode: sportRef?.code ?? null,
    sessionType: row.session_type,
    durationMin: row.duration_min,
    loadUnits: row.load_units,
    intensityZone: row.intensity_zone,
    prescription: row.prescription as unknown as { warmup: string; body: string; cooldown: string } | null,
    interferenceNote: row.interference_note,
    // `explanation_id` n'existe que pour la fenêtre détaillée J→J+6 (AC1, `materializePlanVersion`
    // §10) — un jour "intention" (J+7→J+13, `prescription = null`) n'en a délibérément pas encore :
    // repli neutre plutôt qu'une génération LLM à la volée (interdite en lecture, §6.3).
    explanation: explanation ?? { short: "Aperçu à ce stade — le détail précis arrivera à l'approche de ce jour.", explanationId: "" },
    log,
  };
}

export async function fetchTodayNutritionView(
  admin: SupabaseClient<Database>,
  args: { userId: string; planVersionId: string; date: string },
): Promise<TodayNutritionView | null> {
  const { userId, planVersionId, date } = args;
  const { data: row, error } = await admin
    .from("nutrition_days")
    .select("kcal_target, protein_g, carbs_g, fat_g, modulation_reason, advice_pre, advice_during, advice_post, explanation_id")
    .eq("plan_version_id", planVersionId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`readTodayPlan: nutrition_days — ${error.message}`);
  if (!row) return null;

  const explanation = row.explanation_id ? await fetchExplanationView(admin, row.explanation_id) : null;
  const checkin = await fetchNutritionCheckinSummary(admin, userId, date);

  return {
    kcalTarget: row.kcal_target,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    modulationReason: row.modulation_reason,
    advice: { pre: row.advice_pre ?? "", during: row.advice_during ?? "", post: row.advice_post ?? "" },
    explanation: explanation ?? { short: "Cibles nutritionnelles du jour.", explanationId: "" },
    checkin,
  };
}

/** AC9 — jamais derrière le paywall : lu indépendamment de l'entitlement (ADR-008 §5). */
export async function fetchActivePainNotice(admin: SupabaseClient<Database>, userId: string): Promise<PainNoticeView | null> {
  const { data, error } = await admin
    .from("pain_episodes")
    .select("zone, level, explanation_id")
    .eq("user_id", userId)
    .is("resolved_at", null)
    .in("level", ["persistent", "acute"])
    // 'acute' avant 'persistent' si les deux existent (ordre alphabétique fait déjà ce travail :
    // "acute" < "persistent") — l'alerte la plus grave prime.
    .order("level", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`readTodayPlan: pain_episodes — ${error.message}`);
  if (!data) return null;

  const level = data.level as "persistent" | "acute";
  // Message FIXE (`PAIN_REFERRAL_MESSAGES`), jamais le texte rendu par le LLM/template : voir son
  // en-tête (le template générique catégorie `'pain'` parle d'« adaptation », ambigu au niveau
  // `'acute'`, où AC9 exige explicitement l'absence de toute alternative d'auto-adaptation).
  return { zone: data.zone, level, message: PAIN_REFERRAL_MESSAGES[level] };
}
