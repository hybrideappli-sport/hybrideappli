import { BodyMetricInputSchema, type BodyMetricResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/body-metrics` (AC11, `08-architecture.md` §6.4, finding I7) — poids / sommeil /
 * FC repos. Alimente directement `latestWeightKg()`
 * (`packages/rules-engine/src/pipeline/10-build-nutrition-days.ts`), lue par `buildPlanningContext()`
 * depuis `body_metrics` sur une fenêtre glissante de 70 jours : aucun autre câblage n'est
 * nécessaire côté moteur, la donnée existe déjà dans le contrat `PlanningContext.history.bodyMetrics`.
 *
 * `body_metrics` n'a ni policy `UPDATE` ni `GRANT UPDATE` (`docs/db-schema.md` §6 : « une mesure
 * se corrige par une nouvelle ligne ») — mais porte `unique(user_id, measured_on, source)`. Une
 * seconde saisie pour LA MÊME date (faute de frappe, double clic, retry réseau) ne doit pas
 * échouer en 500 : on la traite comme IDEMPOTENTE et on renvoie la ligne déjà enregistrée plutôt
 * que d'écraser une valeur existante (l'écrasement resterait un `UPDATE`, ce que ce module ne
 * privilégie explicitement pas) — même stratégie que `POST /onboarding/session` sur
 * `onboarding_sessions_one_in_progress`.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = BodyMetricInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Mesure invalide.", parsed.error.issues);

  const consentOk = await hasActiveConsent(supabase, user.id, "health_data_processing");
  if (!consentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le consentement au traitement des données de santé est requis pour cette saisie.");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("body_metrics")
    .insert({
      user_id: user.id,
      measured_on: parsed.data.measuredOn,
      weight_kg: parsed.data.weightKg ?? null,
      resting_hr: parsed.data.restingHr ?? null,
      sleep_hours: parsed.data.sleepHours ?? null,
      hrv_ms: parsed.data.hrvMs ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("body_metrics")
        .select("id")
        .eq("user_id", user.id)
        .eq("measured_on", parsed.data.measuredOn)
        .eq("source", "declared")
        .single();
      if (existingError) return apiError(500, "INTERNAL_ERROR", existingError.message);
      return apiJson<BodyMetricResponse>({ metricId: existing.id });
    }
    if (insertError.message.toLowerCase().includes("row-level security")) {
      return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
    }
    return apiError(500, "INTERNAL_ERROR", insertError.message);
  }

  return apiJson<BodyMetricResponse>({ metricId: inserted.id });
}
