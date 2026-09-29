import { NutritionCheckinInputSchema, type NutritionCheckinResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { applyNutritionCheckin, NutritionCheckinPersistenceError } from "@/lib/orchestration/apply-nutrition-checkin";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/nutrition-checkins` — AC4, AC11 (`08-architecture.md` §6.4). Saisie légère
 * UNIQUEMENT : `adherence` (3 niveaux) + `energy` — jamais de carnet alimentaire détaillé.
 * L'écriture est `applyNutritionCheckin()`, partagée avec le débrief (US-05).
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

  try {
    return apiJson<NutritionCheckinResponse>(await applyNutritionCheckin(supabase, { userId: user.id, input: parsed.data }));
  } catch (error) {
    if (error instanceof NutritionCheckinPersistenceError) {
      if (error.message.toLowerCase().includes("row-level security")) {
        return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
      }
      return apiError(500, "INTERNAL_ERROR", error.message);
    }
    throw error;
  }
}
