import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { requireUser } from "@/lib/api/require-user";
import { enqueueJob } from "@/lib/jobs/queue";
import { exchangeAuthorizationCode, verifySignedState, InvalidOAuthStateError } from "@/lib/providers/strava/oauth";
import { storeTokens } from "@/lib/providers/strava/tokens";
import { refreshDataRegime } from "@/lib/data/refresh-data-regime";

export const dynamic = "force-dynamic";

const DONNEES_PATH = "/donnees";

function redirectToDonnees(origin: string, error?: string): NextResponse {
  const url = new URL(DONNEES_PATH, origin);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

/**
 * `GET /api/v1/data/connections/:provider/callback` — AC2, ADR-013 §2. Authentifié (session) +
 * `state` vérifié CONTRE L'UTILISATEUR DE LA SESSION (pas seulement contre sa signature). Échange le
 * code, chiffre les jetons, `status='active'`, enrôle `strava_backfill`, redirige vers `/donnees` —
 * une erreur à quelque étape que ce soit redirige aussi (jamais une page d'erreur brute, AC2).
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { origin, searchParams } = new URL(request.url);

  const { user } = await requireUser();
  if (!user) return redirectToDonnees(origin, "unauthenticated");

  if (provider !== "strava") return redirectToDonnees(origin, "unsupported_provider");

  // L'utilisateur a refusé l'autorisation côté Strava (`error=access_denied`) — pas une erreur
  // technique, un choix légitime : retour silencieux vers l'écran Connexion données.
  if (searchParams.get("error")) return redirectToDonnees(origin);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return redirectToDonnees(origin, "missing_code_or_state");

  try {
    verifySignedState(state, { expectedUserId: user.id, expectedProvider: provider });
  } catch (error) {
    if (error instanceof InvalidOAuthStateError) return redirectToDonnees(origin, "invalid_state");
    throw error;
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: connection, error: connectionError } = await admin
    .from("data_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider_code", provider)
    .in("status", ["pending", "active", "needs_reauth"])
    .maybeSingle();
  if (connectionError) {
    console.error(`[strava-callback] lecture data_connections échouée : ${connectionError.message}`);
    return redirectToDonnees(origin, "internal_error");
  }
  if (!connection) return redirectToDonnees(origin, "no_pending_connection");

  let exchanged;
  try {
    exchanged = await exchangeAuthorizationCode(code);
  } catch (error) {
    console.error(`[strava-callback] échange du code échoué : ${error instanceof Error ? error.message : error}`);
    return redirectToDonnees(origin, "token_exchange_failed");
  }

  const { error: updateError } = await admin
    .from("data_connections")
    .update({
      status: "active",
      external_account_id: exchanged.athleteId,
      scopes: [searchParams.get("scope") ?? ""].filter(Boolean),
      connected_at: new Date().toISOString(),
      last_error_code: null,
    })
    .eq("id", connection.id);
  if (updateError) {
    // Cas réel : `data_connections_external_account` — cet athlète Strava est déjà lié à un AUTRE
    // compte Hybride Club (un compte tiers ne peut alimenter qu'un seul compte, §10.3).
    console.error(`[strava-callback] activation de la connexion ${connection.id} échouée : ${updateError.message}`);
    return redirectToDonnees(origin, updateError.code === "23505" ? "already_linked" : "internal_error");
  }

  await storeTokens(admin, { connectionId: connection.id, accessToken: exchanged.accessToken, refreshToken: exchanged.refreshToken, expiresAt: exchanged.expiresAt });
  await refreshDataRegime(admin, user.id);

  await enqueueJob(admin, {
    kind: "strava_backfill",
    userId: user.id,
    idempotencyKey: `strava_backfill:${connection.id}`,
    payload: { connectionId: connection.id },
    scheduledFor: new Date().toISOString(),
  });

  return redirectToDonnees(origin);
}
