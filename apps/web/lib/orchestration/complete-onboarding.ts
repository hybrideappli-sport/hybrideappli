import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import type { ConfirmedProfile } from "@hybride/domain";

import { resolveOrCreateSport } from "./resolve-sport";

/**
 * Persiste le profil DÉCLARATIF confirmé par l'utilisateur (AC1 : « il valide son profil
 * initial ») — `athlete_profiles`, `athlete_sports`, `availability_slots`, `objectives`,
 * `risk_flags` (`08-architecture.md` §6.1). Écrit avec le client `rls` (authentifié, cookie de
 * session), PAS `service_role` : ce sont des « tables utilisateur » (`docs/db-schema.md` §5.1), le
 * verrou de consentement santé (`has_active_consent`) doit s'appliquer réellement, en profondeur,
 * pas seulement être vérifié une fois en amont dans le Route Handler.
 *
 * Limite assumée de ce lot : `risk_flags.notes_enc` (chiffrement pgcrypto, clé hors base —
 * ADR-010 §5) n'est PAS implémenté ici faute de gestion de clé définie par un lot précédent — les
 * notes libres éventuelles ne sont donc jamais persistées en clair NI chiffrées : elles sont
 * silencieusement ignorées (`flagType` seul est conservé). Voir le rapport de fin de lot.
 */
export async function completeOnboarding(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; profile: ConfirmedProfile },
): Promise<{ objectiveId: string }> {
  const { userId, profile } = args;

  const { error: profileError } = await rls.from("athlete_profiles").upsert(
    {
      user_id: userId,
      birth_date: profile.birthDate,
      sex_at_birth: profile.sexAtBirth,
      height_cm: profile.heightCm,
      experience_level: profile.experienceLevel,
      training_years: profile.trainingYears,
      declared_weekly_sessions: profile.declaredWeeklySessions,
      declared_weekly_hours: profile.declaredWeeklyHours,
      training_history: profile.trainingHistory as unknown as Json,
      nutrition_habits: profile.nutritionHabits as unknown as Json,
      dietary_constraints: profile.dietaryConstraints,
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw new OnboardingPersistenceError("athlete_profiles", profileError.message);

  const sportIds = await Promise.all(profile.sports.map((sport) => resolveOrCreateSport(admin, sport.sportCode)));
  const { error: sportsError } = await rls.from("athlete_sports").insert(
    profile.sports.map((sport, index) => ({
      user_id: userId,
      sport_id: sportIds[index]!,
      level: sport.level,
      priority: sport.priority,
      weekly_sessions_declared: sport.weeklySessionsDeclared,
      years_practice: sport.yearsPractice,
      is_primary: sport.isPrimary,
    })),
  );
  if (sportsError) throw new OnboardingPersistenceError("athlete_sports", sportsError.message);

  if (profile.availability.length > 0) {
    const { error: availabilityError } = await rls.from("availability_slots").insert(
      profile.availability.map((slot) => ({
        user_id: userId,
        weekday: slot.weekday,
        slot: slot.slot,
        max_minutes: slot.maxMinutes,
        is_available: slot.isAvailable,
      })),
    );
    if (availabilityError) throw new OnboardingPersistenceError("availability_slots", availabilityError.message);
  }

  const objectiveSportId = profile.objective.sportCode ? await resolveOrCreateSport(admin, profile.objective.sportCode) : null;
  const { data: objectiveRow, error: objectiveError } = await rls
    .from("objectives")
    .insert({
      user_id: userId,
      sport_id: objectiveSportId,
      kind: profile.objective.kind,
      label: profile.objective.label,
      target_date: profile.objective.targetDate,
      target_metric: profile.objective.targetMetric as unknown as Json,
    })
    .select("id")
    .single();
  if (objectiveError) throw new OnboardingPersistenceError("objectives", objectiveError.message);

  if (profile.riskFlags.length > 0) {
    const { error: riskFlagsError } = await rls.from("risk_flags").insert(
      profile.riskFlags.map((flag) => ({
        user_id: userId,
        flag_type: flag.flagType,
        source: "onboarding",
        restrictions: {},
      })),
    );
    if (riskFlagsError) throw new OnboardingPersistenceError("risk_flags", riskFlagsError.message);
  }

  return { objectiveId: objectiveRow.id };
}

export class OnboardingPersistenceError extends Error {
  constructor(
    public readonly table: string,
    message: string,
  ) {
    super(`completeOnboarding: ${table} — ${message}`);
  }
}
