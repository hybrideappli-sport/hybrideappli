import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type {
  AthleteProfileSnapshot,
  AthleteSportSnapshot,
  AvailabilitySnapshot,
  BodyMetricSnapshot,
  NutritionCheckinSnapshot,
  ObjectiveSnapshot,
  PainEpisodeSnapshot,
  PlanningContext,
  PlanTrigger,
  RiskFlagSnapshot,
  SessionLogSnapshot,
} from "@hybride/domain";

import { addDaysIso } from "../dates";
import { canonicalHash } from "./hash";

/**
 * Fenêtre glissante de réalisé chargée en contexte (`08-architecture.md` §4.1 : « fenêtre glissante
 * ≥ 8 semaines »). 70 jours = 10 semaines, marge volontaire au-delà du minimum architectural pour
 * couvrir la fenêtre de comparaison à 2× `rolling_window_weeks` d'`evaluateStagnation` (Lot L2)
 * sans dépendre d'une valeur de ruleset non encore résolue à cet endroit de la construction.
 */
const HISTORY_WINDOW_DAYS = 70;

/**
 * `buildPlanningContext()` — assemble le `PlanningContext` du moteur (Lot L2) depuis les tables
 * réelles (`08-architecture.md` §3.2, plan §6 étape 17). Toujours appelé avec le client
 * `service_role` : c'est un traitement d'orchestration serveur, pas une lecture au nom de
 * l'utilisateur (il agrège des tables auxquelles l'utilisateur a par ailleurs un accès `SELECT`
 * direct — aucune fuite de périmètre, seulement une commodité d'exécution serveur unique).
 *
 * Lot L4 : `history.sessionLogs`/`nutritionCheckins`/`bodyMetrics` sont désormais peuplés depuis
 * les tables réelles (fenêtre glissante `HISTORY_WINDOW_DAYS`) — nécessaire à l'asymétrie AC4
 * (`hasActiveNegativeSignal`) et au protocole douleur AC9 (`evaluatePainProtocol`), tous deux lus
 * par `applyDailyLog()`. `history.completedWeeks` (agrégats hebdomadaires comparables, consommés
 * par `evaluateStagnation` AC6/AC7) reste `[]` : son calcul est le travail dédié du job de révision
 * hebdomadaire (Lot L5) — `GET /progress/diagnosis` (Lot L4) calcule sa propre calibration en
 * lecture directe plutôt que de dépendre de cet agrégat encore absent (voir son en-tête).
 */
export async function buildPlanningContext(
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; trigger: PlanTrigger; objectiveId: string },
): Promise<{ context: PlanningContext; hash: string }> {
  const { userId, now, trigger, objectiveId } = args;
  const windowStart = addDaysIso(now, -HISTORY_WINDOW_DAYS);

  const [
    profileRes,
    sportsRes,
    objectiveRes,
    riskFlagsRes,
    availabilityRes,
    painEpisodesRes,
    profileRowRes,
    activePlanRes,
    sessionLogsRes,
    nutritionCheckinsRes,
    bodyMetricsRes,
  ] = await Promise.all([
    admin.from("athlete_profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("athlete_sports").select("*, sports(code, family, default_muscle_groups, is_documented)").eq("user_id", userId),
    admin.from("objectives").select("*").eq("id", objectiveId).single(),
    admin.from("risk_flags").select("*").eq("user_id", userId).eq("is_active", true),
    admin.from("availability_slots").select("*").eq("user_id", userId),
    admin.from("pain_episodes").select("*").eq("user_id", userId).is("resolved_at", null),
    admin.from("profiles").select("timezone").eq("id", userId).single(),
    admin.from("plans").select("id, current_version_id").eq("user_id", userId).eq("status", "active").maybeSingle(),
    admin
      .from("session_logs")
      .select("id, logged_date, sport_id, planned_session_id, completion, actual_duration_min, rpe, freshness, pain, pain_zone, pain_at_rest")
      .eq("user_id", userId)
      .gte("logged_date", windowStart)
      .lte("logged_date", now)
      .order("logged_date", { ascending: true }),
    admin
      .from("nutrition_checkins")
      .select("date, adherence, energy")
      .eq("user_id", userId)
      .gte("date", windowStart)
      .lte("date", now)
      .order("date", { ascending: true }),
    admin
      .from("body_metrics")
      .select("measured_on, weight_kg, resting_hr, sleep_hours, hrv_ms")
      .eq("user_id", userId)
      .gte("measured_on", windowStart)
      .lte("measured_on", now)
      .order("measured_on", { ascending: true }),
  ]);

  if (profileRes.error) throw new Error(`buildPlanningContext: athlete_profiles — ${profileRes.error.message}`);
  if (sportsRes.error) throw new Error(`buildPlanningContext: athlete_sports — ${sportsRes.error.message}`);
  if (objectiveRes.error) throw new Error(`buildPlanningContext: objectives — ${objectiveRes.error.message}`);
  if (riskFlagsRes.error) throw new Error(`buildPlanningContext: risk_flags — ${riskFlagsRes.error.message}`);
  if (availabilityRes.error) throw new Error(`buildPlanningContext: availability_slots — ${availabilityRes.error.message}`);
  if (painEpisodesRes.error) throw new Error(`buildPlanningContext: pain_episodes — ${painEpisodesRes.error.message}`);
  if (profileRowRes.error) throw new Error(`buildPlanningContext: profiles — ${profileRowRes.error.message}`);
  if (activePlanRes.error) throw new Error(`buildPlanningContext: plans — ${activePlanRes.error.message}`);
  if (sessionLogsRes.error) throw new Error(`buildPlanningContext: session_logs — ${sessionLogsRes.error.message}`);
  if (nutritionCheckinsRes.error) throw new Error(`buildPlanningContext: nutrition_checkins — ${nutritionCheckinsRes.error.message}`);
  if (bodyMetricsRes.error) throw new Error(`buildPlanningContext: body_metrics — ${bodyMetricsRes.error.message}`);

  const athleteProfileRow = profileRes.data;
  if (!athleteProfileRow) {
    throw new Error(`buildPlanningContext: aucun athlete_profiles pour user=${userId} — profil non confirmé (AC1).`);
  }

  const profile: AthleteProfileSnapshot = {
    userId,
    birthDate: athleteProfileRow.birth_date,
    sexAtBirth: (athleteProfileRow.sex_at_birth as "male" | "female" | null) ?? null,
    heightCm: athleteProfileRow.height_cm,
    experienceLevel: athleteProfileRow.experience_level as AthleteProfileSnapshot["experienceLevel"],
    trainingYears: athleteProfileRow.training_years,
    declaredWeeklySessions: athleteProfileRow.declared_weekly_sessions,
    declaredWeeklyHours: athleteProfileRow.declared_weekly_hours,
    dietaryConstraints: athleteProfileRow.dietary_constraints,
  };

  const sports: AthleteSportSnapshot[] = (sportsRes.data ?? []).map((row) => {
    const sportRef = row.sports as unknown as {
      code: string;
      family: string;
      default_muscle_groups: string[];
      is_documented: boolean;
    } | null;
    return {
      sportId: row.sport_id,
      code: sportRef?.code ?? "unknown",
      family: (sportRef?.family as AthleteSportSnapshot["family"]) ?? "mixed",
      defaultMuscleGroups: (sportRef?.default_muscle_groups as AthleteSportSnapshot["defaultMuscleGroups"]) ?? [],
      isDocumented: sportRef?.is_documented ?? false,
      level: row.level as AthleteSportSnapshot["level"],
      priority: row.priority,
      weeklySessionsDeclared: row.weekly_sessions_declared,
      isPrimary: row.is_primary,
    };
  });

  const objectiveRow = objectiveRes.data;
  const objective: ObjectiveSnapshot = {
    id: objectiveRow.id,
    sportId: objectiveRow.sport_id,
    kind: objectiveRow.kind as ObjectiveSnapshot["kind"],
    targetDate: objectiveRow.target_date,
    targetMetric: (objectiveRow.target_metric as Record<string, unknown>) ?? {},
    status: objectiveRow.status,
    feasibility: objectiveRow.feasibility,
  };

  const riskFlags: RiskFlagSnapshot[] = (riskFlagsRes.data ?? []).map((row) => ({
    flagType: row.flag_type,
    isActive: row.is_active,
    restrictions: (row.restrictions as Record<string, unknown>) ?? {},
  }));

  const availability: AvailabilitySnapshot[] = (availabilityRes.data ?? []).map((row) => ({
    weekday: row.weekday,
    slot: row.slot,
    maxMinutes: row.max_minutes,
    isAvailable: row.is_available,
  }));

  const painEpisodes: PainEpisodeSnapshot[] = (painEpisodesRes.data ?? []).map((row) => ({
    zone: row.zone,
    level: row.level,
    consecutiveSignals: row.consecutive_signals,
    firstSignalOn: row.first_signal_on,
    lastSignalOn: row.last_signal_on,
    zoneBlocked: row.zone_blocked,
    referralIssued: row.referral_issued,
    resolvedAt: row.resolved_at,
  }));

  // AC4, AC9 — Lot L4 : nécessaire à `hasActiveNegativeSignal()` (asymétrie hausse/baisse) et à
  // `evaluatePainProtocol()`. `actualLoadUnits`/`plannedLoadUnits` restent `null` : aucune règle du
  // Lot L2/L4 ne les lit encore (grep confirmé) — leur calcul (`session_logs` ne porte pas de
  // charge propre ; il faudrait la dériver de `planned_sessions.load_units` × ratio de complétion)
  // est un travail dédié à l'agrégation hebdomadaire AC6 du Lot L5, pas dupliqué ici par anticipation.
  const sessionLogs: SessionLogSnapshot[] = (sessionLogsRes.data ?? []).map((row) => ({
    id: row.id,
    loggedDate: row.logged_date,
    sportId: row.sport_id,
    plannedSessionId: row.planned_session_id,
    completion: row.completion,
    actualDurationMin: row.actual_duration_min,
    actualLoadUnits: null,
    plannedLoadUnits: null,
    rpe: row.rpe,
    freshness: row.freshness,
    pain: row.pain,
    painZone: row.pain_zone,
    painAtRest: row.pain_at_rest,
  }));

  const nutritionCheckins: NutritionCheckinSnapshot[] = (nutritionCheckinsRes.data ?? []).map((row) => ({
    date: row.date,
    adherence: row.adherence,
    energy: row.energy,
  }));

  const bodyMetrics: BodyMetricSnapshot[] = (bodyMetricsRes.data ?? []).map((row) => ({
    measuredOn: row.measured_on,
    weightKg: row.weight_kg,
    restingHr: row.resting_hr,
    sleepHours: row.sleep_hours,
    hrvMs: row.hrv_ms,
  }));

  let previousPlan: PlanningContext["previousPlan"] = null;
  if (activePlanRes.data?.current_version_id) {
    const { data: versionRow, error: versionError } = await admin
      .from("plan_versions")
      .select("snapshot")
      .eq("id", activePlanRes.data.current_version_id)
      .single();
    if (versionError) throw new Error(`buildPlanningContext: plan_versions — ${versionError.message}`);
    previousPlan = versionRow.snapshot as unknown as PlanningContext["previousPlan"];
  }

  const context: PlanningContext = {
    now,
    timezone: profileRowRes.data.timezone,
    trigger,
    profile,
    sports,
    objective,
    riskFlags,
    availability,
    // Lot L4 : `sessionLogs`/`nutritionCheckins`/`bodyMetrics` peuplés depuis les tables réelles
    // (fenêtre glissante ci-dessus). `completedWeeks` reste `[]` — agrégat hebdomadaire, travail du
    // job de révision (Lot L5), voir l'en-tête de fonction.
    history: { sessionLogs, nutritionCheckins, bodyMetrics, completedWeeks: [] },
    painEpisodes,
    previousPlan,
    dataRegime: athleteProfileRow.data_regime,
  };

  return { context, hash: canonicalHash(context) };
}
