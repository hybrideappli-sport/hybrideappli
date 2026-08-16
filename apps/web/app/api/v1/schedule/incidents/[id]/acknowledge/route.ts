import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { AcknowledgeIncidentResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/schedule/incidents/:id/acknowledge` — amendement ADR-017 §9, pendant exact de
 * `POST /plan/reviews/:diffId/acknowledge` (§6.3). N'écrit QUE `acknowledged_at` — jamais
 * `session_logs` (ce qui est acquitté est la DÉDUCTION du coach, pas le fait). Idempotent : un
 * second appel renvoie l'horodatage déjà posé, en `200`. Ne consomme jamais d'accès libre.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: incidentId } = await params;
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  const { data: incident, error: incidentError } = await admin
    .from("schedule_incidents")
    .select("id, user_id, closeout_outcome, acknowledged_at")
    .eq("id", incidentId)
    .maybeSingle();
  if (incidentError) return apiError(500, "INTERNAL_ERROR", incidentError.message);
  // Jamais de divulgation d'existence : un imprévu inconnu ou appartenant à un tiers rend le même 404.
  if (!incident || incident.user_id !== user.id) return apiError(404, "NOT_FOUND", "Imprévu introuvable.");

  if (incident.acknowledged_at) {
    return apiJson<AcknowledgeIncidentResponse>({ acknowledgedAt: incident.acknowledged_at }, { headers: { "Cache-Control": "no-store" } });
  }

  // Doublé en base par `schedule_incidents_ack_requires_created_log` — contrôle explicite ici pour
  // renvoyer un message clair plutôt qu'un `permission denied`/`check violation` opaque.
  if (incident.closeout_outcome !== "log_created") {
    return apiError(409, "CONFLICT", "Cet imprévu n'a produit aucune séance non réalisée à acquitter.");
  }

  const acknowledgedAt = new Date().toISOString();
  const { error: updateError } = await admin.from("schedule_incidents").update({ acknowledged_at: acknowledgedAt }).eq("id", incidentId);
  if (updateError) return apiError(500, "INTERNAL_ERROR", updateError.message);

  return apiJson<AcknowledgeIncidentResponse>({ acknowledgedAt }, { headers: { "Cache-Control": "no-store" } });
}
