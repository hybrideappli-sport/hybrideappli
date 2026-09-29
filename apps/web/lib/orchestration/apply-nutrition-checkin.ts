import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { NutritionCheckinInput, NutritionCheckinResponse } from "@hybride/domain";

export class NutritionCheckinPersistenceError extends Error {}

/**
 * `applyNutritionCheckin()` — AC4, AC11 : le check-in nutrition de la journée, créé ou mis à jour.
 * Extrait de `POST /nutrition-checkins` pour que le débrief (US-05, amendement ADR-019 du
 * 2026-09-26) écrive par le MÊME chemin que le formulaire, comme il le fait déjà pour le réalisé.
 *
 * `rls` est le client de l'utilisateur : les policies `nutrition_checkins_*_own` revérifient le
 * consentement santé en profondeur.
 *
 * N'écrit jamais via `.upsert()` : `nutrition_checkins` n'a de `GRANT UPDATE` que sur un
 * sous-ensemble de colonnes (`adherence, energy, comment, nutrition_day_id` — `docs/db-schema.md`
 * §6), et le `ON CONFLICT ... DO UPDATE` généré par `upsert()` référence TOUTES les colonnes du
 * payload (y compris `user_id`/`date`, hors GRANT) — même piège déjà documenté dans
 * `apps/web/lib/orchestration/complete-onboarding.ts` pour `athlete_profiles`.
 */
export async function applyNutritionCheckin(
  rls: SupabaseClient<Database>,
  args: { userId: string; input: NutritionCheckinInput },
): Promise<NutritionCheckinResponse> {
  const { userId, input } = args;

  const { data: existing, error: existingError } = await rls
    .from("nutrition_checkins")
    .select("id")
    .eq("user_id", userId)
    .eq("date", input.date)
    .maybeSingle();
  if (existingError) throw new NutritionCheckinPersistenceError(`applyNutritionCheckin: lecture — ${existingError.message}`);

  if (existing) {
    const { error } = await rls
      .from("nutrition_checkins")
      .update({ adherence: input.adherence, energy: input.energy, comment: input.comment ?? null })
      .eq("id", existing.id);
    if (error) throw new NutritionCheckinPersistenceError(`applyNutritionCheckin: mise à jour — ${error.message}`);
    return { checkinId: existing.id };
  }

  const { data: inserted, error: insertError } = await rls
    .from("nutrition_checkins")
    .insert({ user_id: userId, date: input.date, adherence: input.adherence, energy: input.energy, comment: input.comment ?? null })
    .select("id")
    .single();
  if (insertError) throw new NutritionCheckinPersistenceError(`applyNutritionCheckin: insertion — ${insertError.message}`);
  return { checkinId: inserted.id };
}
