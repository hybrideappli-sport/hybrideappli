import { NutritionCheckinInputSchema, type NutritionCheckinResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/nutrition-checkins` — AC4, AC11 (`08-architecture.md` §6.4). Saisie légère
 * UNIQUEMENT : `adherence` (3 niveaux) + `energy` — jamais de carnet alimentaire détaillé. N'écrit
 * jamais via `.upsert()` : `nutrition_checkins` n'a de `GRANT UPDATE` que sur un sous-ensemble de
 * colonnes (`adherence, energy, comment, nutrition_day_id` — `docs/db-schema.md` §6), et le
 * `ON CONFLICT ... DO UPDATE` généré par `upsert()` référence TOUTES les colonnes du payload
 * (y compris `user_id`/`date`, hors GRANT) — même piège déjà documenté dans
 * `apps/web/lib/orchestration/complete-onboarding.ts` pour `athlete_profiles`.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = NutritionCheckinInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Check-in nutrition invalide.", parsed.error.issues);

  const consentOk = await hasActiveConsent(supabase, user.id, "health_data_processing");
  if (!consentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le consentement au traitement des données de santé est requis pour cette saisie.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("nutrition_checkins")
    .select("id")
    .eq("user_id", user.id)
    .eq("date", parsed.data.date)
    .maybeSingle();
  if (existingError) return apiError(500, "INTERNAL_ERROR", existingError.message);

  if (existing) {
    const { error } = await supabase
      .from("nutrition_checkins")
      .update({ adherence: parsed.data.adherence, energy: parsed.data.energy, comment: parsed.data.comment ?? null })
      .eq("id", existing.id);
    if (error) return apiError(500, "INTERNAL_ERROR", error.message);
    return apiJson<NutritionCheckinResponse>({ checkinId: existing.id });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("nutrition_checkins")
    .insert({
      user_id: user.id,
      date: parsed.data.date,
      adherence: parsed.data.adherence,
      energy: parsed.data.energy,
      comment: parsed.data.comment ?? null,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.message.toLowerCase().includes("row-level security")) {
      return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
    }
    return apiError(500, "INTERNAL_ERROR", insertError.message);
  }

  return apiJson<NutritionCheckinResponse>({ checkinId: inserted.id });
}
