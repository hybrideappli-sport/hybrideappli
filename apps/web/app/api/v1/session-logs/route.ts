import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { CreateSessionLogInputSchema, type CreateSessionLogResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { applyDailyLog, NoActivePlanError, SessionLogPersistenceError } from "@/lib/orchestration/apply-daily-log";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/session-logs` — AC4, AC9 (`08-architecture.md` §6.4). Ne consomme PAS d'accès
 * libre (ADR-008 §5) ; exige le consentement santé actif, vérifié ici ET en profondeur par la
 * policy RLS `session_logs_insert_own` (défense en profondeur, même schéma que `/complete` Lot L3).
 *
 * Portée assumée de ce lot : `PATCH` (modification d'une saisie existante, également listé par
 * `08-architecture.md` §6.4) n'est pas implémenté — seule la création l'est. Voir le rapport de fin
 * de lot.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = CreateSessionLogInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Saisie invalide.", parsed.error.issues);

  const consentOk = await hasActiveConsent(supabase, user.id, "health_data_processing");
  if (!consentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le consentement au traitement des données de santé est requis pour cette saisie.");
  }

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();

  try {
    const result = await applyDailyLog(supabase, admin, { userId: user.id, now, input: parsed.data });
    return apiJson<CreateSessionLogResponse>(result);
  } catch (error) {
    if (error instanceof SessionLogPersistenceError) {
      if (error.message.toLowerCase().includes("row-level security")) {
        return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
      }
      return apiError(500, "INTERNAL_ERROR", error.message);
    }
    if (error instanceof NoActivePlanError) {
      return apiError(409, "CONFLICT", error.message);
    }
    throw error;
  }
}
