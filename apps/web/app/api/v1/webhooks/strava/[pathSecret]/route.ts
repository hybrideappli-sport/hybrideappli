import { timingSafeEqual } from "node:crypto";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { enqueueJob } from "@/lib/jobs/queue";
import { getStravaConfig } from "@/lib/providers/strava/config";
import { FixedWindowRateLimiter } from "@/lib/rate-limit/fixed-window-limiter";

export const dynamic = "force-dynamic";
// Corps brut requis à la validation ; l'Edge Runtime réécrirait potentiellement le flux (même
// rationale que `webhooks/stripe/route.ts`).
export const runtime = "nodejs";

/**
 * `GET/POST /api/v1/webhooks/strava/:pathSecret` — ADR-013 §1. Le segment `pathSecret` n'est JAMAIS
 * journalisé (aucun `console.log`/`console.error` de ce module ne l'inclut).
 *
 * `POST` : « enrôle un job et rend la main. < 2 s. Aucun appel réseau, aucune écriture métier. » Le
 * payload n'est JAMAIS cru : seuls `object_id`/`aspect_type`/`object_type`/`owner_id` sont lus,
 * l'activité est intégralement RE-récupérée avec notre propre jeton dans le job
 * (`sync-data-connection.ts`).
 *
 * I3 — limitation de débit (ADR-013 §1, défense complémentaire jamais implémentée jusqu'ici).
 * Instance PARTAGÉE au niveau du module (persiste tant que le process/l'instance serverless reste
 * chaud) — voir `fixed-window-limiter.ts` pour le choix « en mémoire, pas en base ». Appliquée
 * APRÈS `verifyPathSecret()` : une requête sans le bon secret est déjà rejetée en `403`, gratuite à
 * refuser, et ne doit pas pouvoir épuiser le budget réservé aux appels correctement authentifiés
 * (c'est CE budget que ce lot protège — « au-delà du secret de chemin déjà vérifié »). Une seule
 * clé globale par verbe : ce endpoint sert UNE SEULE souscription webhook Strava, tous athlètes
 * confondus (ADR-013 §1), il n'y a donc pas de notion de « par utilisateur » à ce stade.
 */
const stravaWebhookPostRateLimiter = new FixedWindowRateLimiter({
  windowMs: Number(process.env.STRAVA_WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.STRAVA_WEBHOOK_RATE_LIMIT_MAX ?? 120),
});
const stravaWebhookGetRateLimiter = new FixedWindowRateLimiter({
  windowMs: Number(process.env.STRAVA_WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.STRAVA_WEBHOOK_SUBSCRIBE_RATE_LIMIT_MAX ?? 20),
});

function rateLimitResponse(retryAfterMs: number) {
  console.warn(`[strava-webhook] limite de débit atteinte — requête refusée, retry dans ${Math.ceil(retryAfterMs / 1000)}s.`);
  return apiError(429, "RATE_LIMITED", "Trop de requêtes — réessaie plus tard.", undefined, { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) });
}
function verifyPathSecret(pathSecret: string): boolean {
  const config = getStravaConfig();
  // Comparaison en temps constant (finding I4, revue post-`aaba499`) : `===` sur des chaînes fuit
  // la position du premier octet différent par une différence de timing mesurable à distance —
  // exactement le risque que le reste du projet neutralise sur les autres secrets comparés côté
  // serveur (signature Stripe, vérifiée par `stripe.webhooks.constructEvent()`, HMAC en temps
  // constant côté SDK). `timingSafeEqual` exige deux `Buffer` de MÊME longueur : le rejet anticipé
  // sur une longueur différente ne fuit que la LONGUEUR du secret (jamais son contenu), et reste en
  // temps constant par rapport au CONTENU pour toute paire de tentatives de même longueur — c'est le
  // patron standard documenté par la doc Node.js de `crypto.timingSafeEqual`.
  const expected = Buffer.from(config.webhookPathSecret);
  const received = Buffer.from(pathSecret);
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

export async function GET(request: Request, { params }: { params: Promise<{ pathSecret: string }> }) {
  const { pathSecret } = await params;
  if (!verifyPathSecret(pathSecret)) return apiError(403, "FORBIDDEN", "Requête webhook refusée.");

  const getRateLimit = stravaWebhookGetRateLimiter.consume("strava-webhook-get");
  if (!getRateLimit.allowed) return rateLimitResponse(getRateLimit.retryAfterMs);

  const { searchParams } = new URL(request.url);
  const config = getStravaConfig();
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === config.verifyToken && challenge) {
    return apiJson({ "hub.challenge": challenge });
  }
  return apiError(403, "FORBIDDEN", "Validation de souscription refusée.");
}

interface StravaWebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}

export async function POST(request: Request, { params }: { params: Promise<{ pathSecret: string }> }) {
  const { pathSecret } = await params;
  if (!verifyPathSecret(pathSecret)) return apiError(403, "FORBIDDEN", "Requête webhook refusée.");

  const postRateLimit = stravaWebhookPostRateLimiter.consume("strava-webhook-post");
  if (!postRateLimit.allowed) return rateLimitResponse(postRateLimit.retryAfterMs);

  const rawBody: unknown = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") return apiJson({ received: true }); // corps illisible — acquitté, rien à traiter

  // Ne lit QUE ces champs (ADR-013 §1) — le reste du payload, même présent, est ignoré.
  const event = rawBody as Partial<StravaWebhookEvent>;
  if (!event.object_type || event.object_id === undefined || !event.aspect_type || event.owner_id === undefined) {
    return apiJson({ received: true });
  }

  // Vérification `subscription_id` — défense complémentaire (ADR-013 §1). `STRAVA_WEBHOOK_
  // SUBSCRIPTION_ID` est renseignée par `devops` APRÈS la création de la souscription (« acte
  // d'exploitation », ADR-013 §1) : absente tant que ce n'est pas fait.
  //
  // Doctrine fail-closed (finding I2, revue post-`aaba499`) — même patron que `getStravaConfig()`
  // et `webhooks/stripe/route.ts` (`STRIPE_WEBHOOK_SECRET` absente ⟹ 503 en production) : en
  // PRODUCTION, une variable absente n'est PAS une échappatoire silencieuse, c'est un refus
  // explicite. Hors production (développement, preview, tests E2E — la souscription webhook réelle
  // n'existe pas forcément dans ces environnements), avertissement bruyant mais requête traitée : le
  // segment de chemin secret reste la protection principale.
  const expectedSubscriptionId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
  if (!expectedSubscriptionId) {
    if (process.env.NODE_ENV === "production") {
      console.error("[strava-webhook] STRAVA_WEBHOOK_SUBSCRIPTION_ID absente EN PRODUCTION — requête refusée (fail closed).");
      return apiError(503, "INTERNAL_ERROR", "Webhook Strava non configuré.");
    }
    console.warn("[strava-webhook] STRAVA_WEBHOOK_SUBSCRIPTION_ID non configurée — vérification de subscription_id ignorée (hors production).");
  } else if (String(event.subscription_id) !== expectedSubscriptionId) {
    console.error("[strava-webhook] subscription_id inattendu — événement ignoré.");
    return apiJson({ received: true });
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: connection, error: connectionError } = await admin
    .from("data_connections")
    .select("id, user_id")
    .eq("provider_code", "strava")
    .eq("external_account_id", String(event.owner_id))
    .eq("status", "active")
    .maybeSingle();
  if (connectionError) {
    console.error(`[strava-webhook] lecture data_connections échouée : ${connectionError.message}`);
    return apiJson({ received: true });
  }
  // `owner_id` inconnu (jamais connecté chez nous, ou déjà révoqué) — événement forgé ou obsolète,
  // acquitté sans effet (T « webhook-forged »).
  if (!connection) return apiJson({ received: true });

  if (event.object_type === "athlete") {
    // Déautorisation initiée DEPUIS Strava (ADR-013 §6). Enrôle un job (`runStravaDeauthorize()`,
    // `lib/jobs/sync-data-connection.ts`) plutôt que d'écrire directement ici (finding I1, revue
    // post-`aaba499`) : ADR-013 §1 est littéral — le handler « ne fait que » vérifier
    // `subscription_id`, résoudre `owner_id`, insérer une ligne dans `job_queue`, AUCUNE écriture
    // métier. Une latence base inhabituelle ne mange plus le budget < 2 s de la réponse webhook, et
    // l'échec est rejouable par le back-off standard de `drain.ts` plutôt que silencieusement perdu.
    if (event.updates?.authorized === "false") {
      await enqueueJob(admin, {
        kind: "strava_deauthorize",
        userId: connection.user_id,
        idempotencyKey: `strava_deauthorize:${connection.id}`,
        payload: { connectionId: connection.id },
        scheduledFor: new Date().toISOString(),
      });
    }
    return apiJson({ received: true });
  }

  // `object_type === 'activity'` — enrôle, ne traite RIEN ici (ADR-013 §1).
  await enqueueJob(admin, {
    kind: "strava_activity_sync",
    userId: connection.user_id,
    idempotencyKey: `strava_activity_sync:${connection.id}:${event.object_id}:${event.event_time ?? Date.now()}`,
    payload: { connectionId: connection.id, activityId: String(event.object_id), aspectType: event.aspect_type },
    scheduledFor: new Date().toISOString(),
  });

  return apiJson({ received: true });
}
