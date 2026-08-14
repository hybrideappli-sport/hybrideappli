import "server-only";

/**
 * Secrets de l'intégration Strava — doctrine FAIL-CLOSED, même patron que `lib/stripe.ts`
 * (`STRIPE_SECRET_KEY`) : Strava est une intégration tierce réelle, pas un fournisseur qui admet un
 * mode dégradé applicatif (à la différence de `getLlmProvider()`, `coach-llm-provider.ts`, qui
 * bascule légitimement sur un mock hors production). Sans ces six secrets, AUCUNE fonctionnalité de
 * connexion de données ne peut fonctionner par définition — échec explicite au premier appel,
 * jamais un contournement silencieux.
 *
 * Les tests E2E qui simulent Strava (`data-sources.spec.ts`, `strava-connect.spec.ts`) interceptent
 * les appels réseau SORTANTS vers l'API Strava (`lib/providers/strava/client.ts`, `oauth.ts`), pas
 * ce module : ils positionnent des valeurs factices mais RÉELLEMENT PRÉSENTES pour ces variables.
 *
 * `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` — application Strava (devops/fondateur, plan §26).
 * `STRAVA_WEBHOOK_PATH_SECRET` — segment de chemin secret du webhook (ADR-013 §1), jamais journalisé.
 * `STRAVA_VERIFY_TOKEN` — jeton de validation de la souscription webhook (poignée de main GET).
 * `DATA_TOKEN_ENC_KEY` — clé `pgcrypto` HORS BASE (ADR-013 §2, ADR-010 §5).
 * `OAUTH_STATE_SECRET` — HMAC du `state` OAuth (ADR-013, alternative écartée : pas de table dédiée).
 */
export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  webhookPathSecret: string;
  verifyToken: string;
  tokenEncKey: string;
  oauthStateSecret: string;
}

export class MissingStravaConfigurationError extends Error {}

const REQUIRED_ENV_VARS = [
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "STRAVA_WEBHOOK_PATH_SECRET",
  "STRAVA_VERIFY_TOKEN",
  "DATA_TOKEN_ENC_KEY",
  "OAUTH_STATE_SECRET",
] as const;

let cached: StravaConfig | null = null;

export function getStravaConfig(): StravaConfig {
  if (cached) return cached;

  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const message = `getStravaConfig: variable(s) d'environnement manquante(s) — ${missing.join(", ")}. Aucune fonctionnalité de connexion de données ne peut fonctionner sans elles (voir en-tête de ce fichier, fail-closed).`;
    console.error(`[strava] ${message}`);
    throw new MissingStravaConfigurationError(message);
  }

  cached = {
    clientId: process.env.STRAVA_CLIENT_ID!,
    clientSecret: process.env.STRAVA_CLIENT_SECRET!,
    webhookPathSecret: process.env.STRAVA_WEBHOOK_PATH_SECRET!,
    verifyToken: process.env.STRAVA_VERIFY_TOKEN!,
    tokenEncKey: process.env.DATA_TOKEN_ENC_KEY!,
    oauthStateSecret: process.env.OAUTH_STATE_SECRET!,
  };
  return cached;
}
