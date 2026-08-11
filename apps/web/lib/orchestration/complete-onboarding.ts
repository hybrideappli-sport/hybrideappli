import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import type { ConfirmedProfile } from "@hybride/domain";

import { InvalidSportCodeError, resolveOrCreateSport } from "./resolve-sport";

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
 *
 * Correction post-revue (finding I8) : AC14 permet explicitement à un utilisateur de redéfinir un
 * nouvel objectif après la fin du précédent, ce qui repasse par CET onboarding conversationnel une
 * seconde fois (`/objectif/fin` → `/onboarding/chat`). Un `insert()` pur sur `athlete_profiles`
 * (PK `user_id`) échouait alors systématiquement en 500 (violation de contrainte unique). On ne
 * bascule PAS sur `upsert()` — `ON CONFLICT ... DO UPDATE` généré par PostgREST référence TOUTES
 * les colonnes du payload, y compris `user_id`, hors du `GRANT UPDATE` colonne par colonne
 * (`docs/db-schema.md` §2) : « permission denied ». On distingue explicitement `insert`/`update`
 * en lisant d'abord l'existence de la ligne — l'`UPDATE` ne porte alors que sur les colonnes
 * effectivement accordées, la policy `athlete_profiles_update_own` (qui revérifie
 * `has_active_consent`) s'applique normalement.
 */
export async function completeOnboarding(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; profile: ConfirmedProfile },
): Promise<{ objectiveId: string }> {
  const { userId, profile } = args;

  const { data: existingProfile, error: existingProfileError } = await rls
    .from("athlete_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingProfileError) throw new OnboardingPersistenceError("athlete_profiles", existingProfileError.message);

  const profilePayload = {
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
  };
  const { error: profileError } = existingProfile
    ? await rls.from("athlete_profiles").update(profilePayload).eq("user_id", userId)
    : await rls.from("athlete_profiles").insert({ user_id: userId, ...profilePayload });
  if (profileError) throw new OnboardingPersistenceError("athlete_profiles", profileError.message);

  // `SportCodeSchema` (`@hybride/domain`) a déjà validé `sportCode` en amont (route `/complete`) —
  // `InvalidSportCodeError` ne devrait donc jamais se produire ici en usage normal. Rattrapée quand
  // même (défense en profondeur, finding I10) et traduite dans le même format d'erreur que le reste
  // de cette fonction plutôt que de remonter comme une exception non gérée (500 opaque).
  let sportIds: string[];
  try {
    sportIds = await Promise.all(profile.sports.map((sport) => resolveOrCreateSport(admin, sport.sportCode)));
  } catch (error) {
    if (error instanceof InvalidSportCodeError) throw new OnboardingPersistenceError("athlete_sports", error.message);
    throw error;
  }
  // `athlete_sports` — contrairement à `athlete_profiles`, `GRANT UPDATE` est pleine largeur
  // (« intégralement déclaratif », `0003_athlete_profile.sql`) et la policy est `for all` : le
  // piège de colonne ci-dessus ne s'applique pas, `upsert()` est donc sûr ici. `onConflict` cible
  // la contrainte `unique(user_id, sport_id)` — un second onboarding qui redéclare un sport déjà
  // connu MET À JOUR sa ligne plutôt que d'échouer (finding I8).
  const { error: sportsError } = await rls.from("athlete_sports").upsert(
    profile.sports.map((sport, index) => ({
      user_id: userId,
      sport_id: sportIds[index]!,
      level: sport.level,
      priority: sport.priority,
      weekly_sessions_declared: sport.weeklySessionsDeclared,
      years_practice: sport.yearsPractice,
      is_primary: sport.isPrimary,
    })),
    { onConflict: "user_id,sport_id" },
  );
  if (sportsError) throw new OnboardingPersistenceError("athlete_sports", sportsError.message);

  if (profile.availability.length > 0) {
    // `availability_slots` n'a pas de contrainte d'unicité par créneau : un second onboarding qui
    // réinsère purement (`insert()`) accumulerait des lignes en double pour le même jour/plage à
    // chaque passage. On repart d'un état propre pour cet utilisateur avant de réinsérer les
    // disponibilités confirmées (finding I8) — `for all` + `grant update … intégralement
    // déclaratif` (0003) : le client RLS peut légitimement le faire pour ses propres lignes.
    const { error: clearAvailabilityError } = await rls.from("availability_slots").delete().eq("user_id", userId);
    if (clearAvailabilityError) throw new OnboardingPersistenceError("availability_slots", clearAvailabilityError.message);

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

  let objectiveSportId: string | null = null;
  if (profile.objective.sportCode) {
    try {
      objectiveSportId = await resolveOrCreateSport(admin, profile.objective.sportCode);
    } catch (error) {
      if (error instanceof InvalidSportCodeError) throw new OnboardingPersistenceError("objectives", error.message);
      throw error;
    }
  }
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
