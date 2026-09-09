import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { DisconnectDataConnectionResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { disconnectDataConnection } from "@/lib/data/disconnect-data-connection";

export const dynamic = "force-dynamic";

/**
 * `DELETE /api/v1/data/connections/:id` — AC10, ADR-013 §6. Révoque chez le fournisseur, supprime
 * les jetons, `status='revoked'`. Les séances déjà importées sont CONSERVÉES — jamais supprimées.
 *
 * Le segment dynamique est nommé `[connection]` et non `[id]` : Next.js interdit deux noms de slug
 * différents au même niveau d'un chemin (`You cannot use different slug names for the same dynamic
 * path`), or `authorize/` et `callback/` partagent ce segment en y lisant un IDENTIFIANT DE
 * FOURNISSEUR (`strava`) là où cette route y lit un UUID de connexion. Le nom neutre est le seul
 * qui satisfasse les deux, et il préserve les trois URL publiques à l'identique — dont
 * `connections/strava/callback`, enregistrée comme `redirect_uri` côté Strava (voir `authorize/`).
 * Chaque route interprète donc ce paramètre selon son propre contexte, et le renomme localement.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ connection: string }> }) {
  const { connection: connectionId } = await params;
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
