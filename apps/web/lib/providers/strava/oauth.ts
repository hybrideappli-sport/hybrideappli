import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getStravaConfig } from "./config";

const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";

/** Permissions minimales nécessaires à l'import minimisé (ADR-013 §4) : lecture seule des activités. */
export const STRAVA_OAUTH_SCOPE = "activity:read";

const STATE_TTL_SECONDS = 600; // 10 min — largement suffisant pour le round-trip OAuth Strava.

interface StateClaims {
  userId: string;
  provider: string;
  nonce: string;
  exp: number;
}

export class InvalidOAuthStateError extends Error {}

/**
 * `state` signé (HMAC), pas de table dédiée (ADR-013, alternative écartée : « une table de plus,
 * avec sa purge »). Le code d'autorisation Strava étant lui-même à usage unique, un HMAC vérifié au
 * retour donne la même garantie CSRF sans état serveur.
 */
export function createSignedState(args: { userId: string; provider: string }): string {
  const config = getStravaConfig();
  const claims: StateClaims = { userId: args.userId, provider: args.provider, nonce: randomUUID(), exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", config.oauthStateSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Vérifié CONTRE L'UTILISATEUR DE LA SESSION (point à ne pas improviser, `plans/US-02-...md` §2) —
 * pas seulement contre sa signature : un `state` valide mais forgé pour un AUTRE utilisateur que
 * celui actuellement authentifié est refusé.
 */
export function verifySignedState(state: string, args: { expectedUserId: string; expectedProvider: string }): void {
  const config = getStravaConfig();
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new InvalidOAuthStateError("state malformé.");

  const expectedSignature = createHmac("sha256", config.oauthStateSecret).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new InvalidOAuthStateError("signature de state invalide.");
  }

  let claims: StateClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as StateClaims;
  } catch {
    throw new InvalidOAuthStateError("state illisible.");
  }

  if (claims.exp < Math.floor(Date.now() / 1000)) throw new InvalidOAuthStateError("state expiré.");
  if (claims.userId !== args.expectedUserId) throw new InvalidOAuthStateError("state ne correspond pas à l'utilisateur de la session.");
  if (claims.provider !== args.expectedProvider) throw new InvalidOAuthStateError("state ne correspond pas au fournisseur attendu.");
}

export function buildAuthorizeUrl(args: { state: string; redirectUri: string }): string {
  const config = getStravaConfig();
  const url = new URL(STRAVA_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", STRAVA_OAUTH_SCOPE);
  url.searchParams.set("state", args.state);
  return url.toString();
}

export interface StravaTokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
  athleteId: string;
}

export async function exchangeAuthorizationCode(code: string): Promise<StravaTokenExchangeResult> {
  const config = getStravaConfig();
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code, grant_type: "authorization_code" }),
  });
  if (!response.ok) {
    throw new Error(`exchangeAuthorizationCode: Strava a répondu ${response.status}.`);
  }
  const body = (await response.json()) as { access_token: string; refresh_token: string; expires_at: number; athlete: { id: number } };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(body.expires_at * 1000).toISOString(),
    athleteId: String(body.athlete.id),
  };
}

export interface StravaRefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

/** Rotation Strava : « un nouveau refresh_token invalide immédiatement l'ancien » (ADR-013 §3). */
export async function refreshAccessToken(refreshToken: string): Promise<StravaRefreshResult> {
  const config = getStravaConfig();
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) {
    throw new Error(`refreshAccessToken: Strava a répondu ${response.status}.`);
  }
  const body = (await response.json()) as { access_token: string; refresh_token: string; expires_at: number };
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: new Date(body.expires_at * 1000).toISOString() };
}

/** `POST /oauth/revoke` — endpoint recommandé depuis le 2026-06-01 (ADR-013 §6). */
export async function revokeAuthorization(accessToken: string): Promise<void> {
  const response = await fetch(STRAVA_DEAUTHORIZE_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  // 401 : le jeton est déjà invalide côté Strava (déautorisation déjà faite depuis Strava,
  // ADR-013 §6) — pas une erreur pour NOUS, la déconnexion locale doit continuer.
  if (!response.ok && response.status !== 401) {
    throw new Error(`revokeAuthorization: Strava a répondu ${response.status}.`);
  }
}
