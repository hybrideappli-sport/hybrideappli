import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { deleteTokens } from "../providers/strava/tokens";
import { revokeAuthorization } from "../providers/strava/oauth";
import { getStravaConfig } from "../providers/strava/config";
import { refreshDataRegime } from "./refresh-data-regime";

/** `data_connections.revoked_reason` — CHECK en base (`0018_data_connections.sql`), pas un enum SQL. */
export type RevokedReason = "user" | "provider_deauthorized" | "consent_withdrawn" | "token_invalid";

export interface DisconnectResult {
  retainedLogs: number;
}

/**
 * `disconnectDataConnection()` — AC10, ADR-013 §6, ADR-015 §3. Chemin UNIQUE de déconnexion,
 * appelé par `DELETE /api/v1/data/connections/:id` (utilisateur), par la branche
 * `third_party_data_import` de `POST /consents/:code/revoke` (retrait de consentement — cascade sur
 * TOUTES les connexions actives), et par le traitement du webhook `athlete` deauthorized (ADR-013
 * §6, `provider_deauthorized`).
 *
 * Révoque chez le fournisseur, supprime les jetons, marque `status = 'revoked'`. Les données déjà
 * importées sont CONSERVÉES (AC10) — leur affichage bascule en « déclaré » par la règle de
 * provenance (`resolveProvenance()`, ADR-015 §3), sans aucune écriture supplémentaire ici :
 * `source` reste immuable, seule `data_connections.status` change.
 */
export async function disconnectDataConnection(
  admin: SupabaseClient<Database>,
  args: { connectionId: string; reason: RevokedReason },
): Promise<DisconnectResult> {
  const { connectionId, reason } = args;

  const { data: connection, error: connectionError } = await admin
    .from("data_connections")
    .select("id, user_id, provider_code, status")
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError) throw new Error(`disconnectDataConnection: lecture data_connections — ${connectionError.message}`);
  if (!connection || connection.status === "revoked") return { retainedLogs: 0 };

  if (connection.provider_code === "strava") {
    try {
      const config = getStravaConfig();
      const { data: secret } = await admin
        .rpc("read_data_connection_secret", { p_connection_id: connectionId, p_key: config.tokenEncKey })
        .maybeSingle();
      if (secret?.access_token) await revokeAuthorization(secret.access_token);
    } catch (error) {
      // La révocation CÔTÉ FOURNISSEUR est une politesse, pas une condition de la déconnexion
      // locale (ex. `provider_deauthorized` : le jeton est déjà mort côté Strava par construction).
      // Ne bloque jamais la suppression locale des jetons ni le passage à `status = 'revoked'`.
      console.error(`[disconnect] révocation Strava échouée pour connexion ${connectionId} : ${error instanceof Error ? error.message : error}`);
    }
  }

  await deleteTokens(admin, connectionId);

  const { error: updateError } = await admin
    .from("data_connections")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", connectionId);
  if (updateError) throw new Error(`disconnectDataConnection: mise à jour data_connections — ${updateError.message}`);

  const { count, error: countError } = await admin
    .from("session_logs")
    .select("id", { count: "exact", head: true })
    .eq("data_connection_id", connectionId)
    .is("excluded_at", null);
  if (countError) throw new Error(`disconnectDataConnection: comptage session_logs — ${countError.message}`);

  await refreshDataRegime(admin, connection.user_id);

  return { retainedLogs: count ?? 0 };
}

/** Révoque TOUTES les connexions actives/en attente d'un utilisateur — retrait du consentement. */
export async function disconnectAllDataConnections(admin: SupabaseClient<Database>, userId: string, reason: RevokedReason): Promise<void> {
  const { data: connections, error } = await admin
    .from("data_connections")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["pending", "active", "needs_reauth"]);
  if (error) throw new Error(`disconnectAllDataConnections: lecture data_connections — ${error.message}`);

  for (const connection of connections ?? []) {
    await disconnectDataConnection(admin, { connectionId: connection.id, reason });
  }
}
