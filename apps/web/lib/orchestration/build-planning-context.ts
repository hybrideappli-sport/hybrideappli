import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type {
  AthleteProfileSnapshot,
  AthleteSportSnapshot,
  AvailabilitySnapshot,
  ObjectiveSnapshot,
  PainEpisodeSnapshot,
  PlanningContext,
  PlanTrigger,
  RiskFlagSnapshot,
} from "@hybride/domain";

import { canonicalHash } from "./hash";

/**
 * `buildPlanningContext()` — assemble le `PlanningContext` du moteur (Lot L2) depuis les tables
 * réelles (`08-architecture.md` §3.2, plan §6 étape 17). Toujours appelé avec le client
 * `service_role` : c'est un traitement d'orchestration serveur, pas une lecture au nom de
 * l'utilisateur (il agrège des tables auxquelles l'utilisateur a par ailleurs un accès `SELECT`
 * direct — aucune fuite de périmètre, seulement une commodité d'exécution serveur unique).
 *
 * Lot L3 : l'utilisateur vient de terminer l'onboarding, l'historique est donc TOUJOURS vide
 * (régime froid, AC12) — `history.completedWeeks` reste hors périmètre de ce lot (alimenté par la
 * boucle quotidienne, Lot L4/L5) et vaut systématiquement `[]` ici.
 */
export async function buildPlanningContext(
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; trigger: PlanTrigger; objectiveId: string },
): Promise<{ context: PlanningContext; hash: string }> {
  const { userId, now, trigger, objectiveId } = args;

  const [profileRes, sportsRes, objectiveRes, riskFlagsRes, availabilityRes, painEpisodesRes, profileRowRes, activePlanRes] =
    await Promise.all([
      admin.from("athlete_profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("athlete_sports").select("*, sports(code, family, default_muscle_groups, is_documented)").eq("user_id", userId),
      admin.from("objectives").select("*").eq("id", objectiveId).single(),
      admin.from("risk_flags").select("*").eq("user_id", userId).eq("is_active", true),
      admin.from("availability_slots").select("*").eq("user_id", userId),
      admin.from("pain_episodes").select("*").eq("user_id", userId).is("resolved_at", null),
      admin.from("profiles").select("timezone").eq("id", userId).single(),
      admin.from("plans").select("id, current_version_id").eq("user_id", userId).eq("status", "active").maybeSingle(),
    ]);

  if (profileRes.error) throw new Error(`buildPlanningContext: athlete_profiles — ${profileRes.error.message}`);
  if (sportsRes.error) throw new Error(`buildPlanningContext: athlete_sports — ${sportsRes.error.message}`);
  if (objectiveRes.error) throw new Error(`buildPlanningContext: objectives — ${objectiveRes.error.message}`);
  if (riskFlagsRes.error) throw new Error(`buildPlanningContext: risk_flags — ${riskFlagsRes.error.message}`);
  if (availabilityRes.error) throw new Error(`buildPlanningContext: availability_slots — ${availabilityRes.error.message}`);
  if (painEpisodesRes.error) throw new Error(`buildPlanningContext: pain_episodes — ${painEpisodesRes.error.message}`);
  if (profileRowRes.error) throw new Error(`buildPlanningContext: profiles — ${profileRowRes.error.message}`);
  if (activePlanRes.error) throw new Error(`buildPlanningContext: plans — ${activePlanRes.error.message}`);

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
    // Lot L3 : utilisateur tout juste onboardé, aucun historique possible (AC12, régime froid).
    // La fenêtre glissante ≥ 8 semaines (`08-architecture.md` §4.1) sera peuplée à partir du
    // Lot L4 (saisies post-séance) et du Lot L5 (révision hebdomadaire).
    history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks: [] },
    painEpisodes,
    previousPlan,
    dataRegime: athleteProfileRow.data_regime,
  };

  return { context, hash: canonicalHash(context) };
}
