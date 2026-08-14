import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { getStravaConfig } from "./config";
import { refreshAccessToken } from "./oauth";

/**
 * Jetons OAuth — chiffrés/déchiffrés ENTIÈREMENT côté Postgres (`store_data_connection_secret()`,
 * `read_data_connection_secret()`, `0023_data_connection_secrets_functions.sql`, ADR-013 §2) : ce
 * module ne manipule jamais de `bytea`, seulement des chaînes en clair reçues de/envoyées vers
 * Strava, et la clé `DATA_TOKEN_ENC_KEY` (hors base).
 */
export async function storeTokens(
  admin: SupabaseClient<Database>,
  args: { connectionId: string; accessToken: string; refreshToken: string; expiresAt: string },
): Promise<void> {
  const config = getStravaConfig();
  const { error } = await admin.rpc("store_data_connection_secret", {
    p_connection_id: args.connectionId,
    p_access_token: args.accessToken,
    p_refresh_token: args.refreshToken,
    p_expires_at: args.expiresAt,
    p_key: config.tokenEncKey,
  });
  if (error) throw new Error(`storeTokens: ${error.message}`);
}

export async function deleteTokens(admin: SupabaseClient<Database>, connectionId: string): Promise<void> {
  const { error } = await admin.from("data_connection_secrets").delete().eq("data_connection_id", connectionId);
  if (error) throw new Error(`deleteTokens: ${error.message}`);
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // rafraîchit 5 min avant expiration effective (jeton valide 6h)
const LEASE_WAIT_MS = 1500;

/**
 * Renvoie un jeton d'accès VALIDE, en le rafraîchissant si nécessaire, sous BAIL EXCLUSIF
 * (`claim_connection_refresh()`, `0018_data_connections.sql`, ADR-013 §3) : deux rafraîchissements
 * concurrents (webhook + cron sur la même connexion) ne cassent jamais la connexion — le perdant
 * attend brièvement puis relit le jeton déjà rafraîchi par le détenteur du bail.
 */
export async function getValidAccessToken(admin: SupabaseClient<Database>, connectionId: string): Promise<string> {
  const config = getStravaConfig();

  const { data: secret, error } = await admin
    .rpc("read_data_connection_secret", { p_connection_id: connectionId, p_key: config.tokenEncKey })
    .maybeSingle();
  if (error) throw new Error(`getValidAccessToken: ${error.message}`);
  if (!secret?.access_token || !secret.refresh_token) throw new Error(`getValidAccessToken: aucun jeton pour la connexion ${connectionId}.`);

  const expiresInMs = new Date(secret.access_token_expires_at ?? 0).getTime() - Date.now();
  if (expiresInMs > REFRESH_MARGIN_MS) return secret.access_token;

  const { data: acquired, error: leaseError } = await admin.rpc("claim_connection_refresh", { p_connection_id: connectionId, p_lease_seconds: 30 });
  if (leaseError) throw new Error(`getValidAccessToken: ${leaseError.message}`);

  if (!acquired) {
    await new Promise((resolve) => setTimeout(resolve, LEASE_WAIT_MS));
    const { data: refreshed, error: rereadError } = await admin
      .rpc("read_data_connection_secret", { p_connection_id: connectionId, p_key: config.tokenEncKey })
      .maybeSingle();
    if (rereadError) throw new Error(`getValidAccessToken: ${rereadError.message}`);
    if (!refreshed?.access_token) throw new Error(`getValidAccessToken: jeton introuvable après attente du bail (connexion ${connectionId}).`);
    return refreshed.access_token;
  }

  const refreshed = await refreshAccessToken(secret.refresh_token);
  await storeTokens(admin, { connectionId, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt });
  return refreshed.accessToken;
}
