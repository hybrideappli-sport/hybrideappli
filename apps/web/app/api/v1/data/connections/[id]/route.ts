import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { DisconnectDataConnectionResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { disconnectDataConnection } from "@/lib/data/disconnect-data-connection";

export const dynamic = "force-dynamic";

/**
 * `DELETE /api/v1/data/connections/:id` — AC10, ADR-013 §6. Révoque chez le fournisseur, supprime
 * les jetons, `status='revoked'`. Les séances déjà importées sont CONSERVÉES — jamais supprimées.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: connectionId } = await params;
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  const { data: connection, error: connectionError } = await admin.from("data_connections").select("id, user_id").eq("id", connectionId).maybeSingle();
  if (connectionError) return apiError(500, "INTERNAL_ERROR", connectionError.message);
  if (!connection || connection.user_id !== user.id) return apiError(404, "NOT_FOUND", "Connexion introuvable.");

  const result = await disconnectDataConnection(admin, { connectionId, reason: "user" });

  const body: DisconnectDataConnectionResponse = { status: "revoked", retainedLogs: result.retainedLogs };
  return apiJson(body);
}
