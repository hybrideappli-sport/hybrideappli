import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { UpdateSessionLogInputSchema, type UpdateSessionLogResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { applySessionLogCorrection, SessionLogNotFoundError, SessionLogPersistenceError } from "@/lib/orchestration/apply-session-log-correction";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";
import { NoActivePlanError } from "@/lib/orchestration/run-session-log-signal-pipeline";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `PATCH /api/v1/session-logs/:id` — F3, `11-design-notes.md` §3.3 : parcours de correction
 * `/aujourdhui?log=<id>`, cible du lien « Je l'ai faite quand même » (`notdone-notice.tsx`,
 * `session-card.tsx`). Route jusqu'ici documentée comme « déjà existante » (ADR-017 §9,
 * `08-architecture.md` §6.4) mais jamais implémentée — ce lot la construit.
 *
 * Même contrat de consentement que `POST /session-logs` (ADR-010 §2, ADR-012 §2) : une correction
 * est une écriture de donnée de santé au même titre qu'une saisie initiale.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: logId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = UpdateSessionLogInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Saisie invalide.", parsed.error.issues);

  const consentOk = await hasActiveConsent(supabase, user.id, "health_data_processing");
  if (!consentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le consentement au traitement des données de santé est requis pour cette correction.");
  }

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();

  try {
    const result = await applySessionLogCorrection(supabase, admin, { userId: user.id, now, logId, input: parsed.data });
    return apiJson<UpdateSessionLogResponse>(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionLogNotFoundError) return apiError(404, "NOT_FOUND", "Séance introuvable.");
    if (error instanceof SessionLogPersistenceError) {
      if (error.message.toLowerCase().includes("row-level security")) {
        return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
      }
      return apiError(500, "INTERNAL_ERROR", error.message);
    }
    if (error instanceof NoActivePlanError) return apiError(409, "CONFLICT", error.message);
    throw error;
  }
}
