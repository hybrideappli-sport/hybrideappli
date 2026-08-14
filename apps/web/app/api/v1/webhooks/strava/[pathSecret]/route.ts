import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { enqueueJob } from "@/lib/jobs/queue";
import { getStravaConfig } from "@/lib/providers/strava/config";

export const dynamic = "force-dynamic";
// Corps brut requis à la validation ; l'Edge Runtime réécrirait potentiellement le flux (même
// rationale que `webhooks/stripe/route.ts`).
export const runtime = "nodejs";

/**
 * `GET/POST /api/v1/webhooks/strava/:pathSecret` — ADR-013 §1. Le segment `pathSecret` n'est JAMAIS
 * journalisé (aucun `console.log`/`console.error` de ce module ne l'inclut).
 *
 * `POST` : « enrôle un job et rend la main. < 2 s. Aucun appel réseau. » Le payload n'est JAMAIS
 * cru : seuls `object_id`/`aspect_type`/`object_type`/`owner_id` sont lus, l'activité est
 * intégralement RE-récupérée avec notre propre jeton dans le job (`sync-data-connection.ts`).
 */
async function verifyPathSecret(pathSecret: string): Promise<boolean> {
  const config = getStravaConfig();
  return pathSecret === config.webhookPathSecret;
}

export async function GET(request: Request, { params }: { params: Promise<{ pathSecret: string }> }) {
  const { pathSecret } = await params;
  if (!(await verifyPathSecret(pathSecret))) return apiError(403, "FORBIDDEN", "Requête webhook refusée.");

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
  if (!(await verifyPathSecret(pathSecret))) return apiError(403, "FORBIDDEN", "Requête webhook refusée.");

  const rawBody: unknown = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") return apiJson({ received: true }); // corps illisible — acquitté, rien à traiter

  // Ne lit QUE ces champs (ADR-013 §1) — le reste du payload, même présent, est ignoré.
  const event = rawBody as Partial<StravaWebhookEvent>;
  if (!event.object_type || event.object_id === undefined || !event.aspect_type || event.owner_id === undefined) {
    return apiJson({ received: true });
  }

  // Vérification `subscription_id` — défense complémentaire (ADR-013 §1). `STRAVA_WEBHOOK_
  // SUBSCRIPTION_ID` est renseignée par `devops` APRÈS la création de la souscription (« acte
  // d'exploitation », ADR-013 §1) : absente tant que ce n'est pas fait, avertissement journalisé au
  // lieu d'un refus — le segment de chemin secret reste la protection principale entre-temps.
  const expectedSubscriptionId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
  if (expectedSubscriptionId && String(event.subscription_id) !== expectedSubscriptionId) {
    console.error("[strava-webhook] subscription_id inattendu — événement ignoré.");
    return apiJson({ received: true });
  }
  if (!expectedSubscriptionId) {
    console.warn("[strava-webhook] STRAVA_WEBHOOK_SUBSCRIPTION_ID non configurée — vérification de subscription_id ignorée (à câbler avec devops).");
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
    // Déautorisation initiée DEPUIS Strava (ADR-013 §6). Local uniquement : AUCUN appel réseau
    // (le jeton est de toute façon déjà mort côté Strava) — respecte le budget < 2 s / 0 I/O réseau
    // du handler.
    if (event.updates?.authorized === "false") {
      await admin.from("data_connection_secrets").delete().eq("data_connection_id", connection.id);
      await admin
        .from("data_connections")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: "provider_deauthorized" })
        .eq("id", connection.id);
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
