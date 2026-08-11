import type Stripe from "stripe";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyUser } from "@/lib/notifications/notify";
import { getStripeClient } from "@/lib/stripe";

/**
 * `POST /api/v1/webhooks/stripe` — ADR-009 §2 : « les webhooks sont la SEULE source de vérité de
 * l'accès ». `runtime = 'nodejs'` explicite (corps brut nécessaire à la vérification de
 * signature — un Edge Runtime réécrirait potentiellement le flux) ; lecture du corps brut
 * (`request.text()`, jamais `request.json()`, qui invaliderait la signature).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_LIKE_STATUSES = new Set(["active", "trialing"]);

/**
 * ⚠️ POINT DE SÉCURITÉ À DURCIR AVANT LA MISE EN PRODUCTION COMMERCIALE ⚠️
 *
 * `STRIPE_WEBHOOK_SECRET` est ABSENTE de cet environnement par arbitrage explicite du fondateur
 * (l'endpoint webhook réel — donc son secret de signature — n'existe que lorsque l'URL de
 * production est connue et enregistrée côté Dashboard Stripe ; le configurer avant est prématuré).
 *
 * Ce module applique EXACTEMENT le même principe que `apps/web/lib/coach-llm-provider.ts` pour
 * `MISTRAL_API_KEY` absente : un repli EXPLICITE, JAMAIS un contournement silencieux.
 *
 *   - Secret présent  ⟹ `stripe.webhooks.constructEvent()` — signature vérifiée, seul chemin
 *     normal.
 *   - Secret absent, `NODE_ENV !== 'production'` ⟹ MODE DEV, log d'avertissement bruyant à
 *     CHAQUE appel, corps lu en JSON SANS vérification de signature. Nécessaire pour développer et
 *     tester ce webhook (E2E `subscribe.spec.ts`, fixtures Stripe) sans dépendre de `stripe listen`.
 *   - Secret absent, `NODE_ENV === 'production'` ⟹ REFUS EXPLICITE (503), alerte journalisée. Ne
 *     JAMAIS accepter un webhook non authentifié en production — un attaquant pourrait sinon
 *     s'auto-délivrer un abonnement premium en forgeant un événement `customer.subscription.created`.
 *
 * **Avant la mise en production commerciale** : créer l'endpoint dans le Dashboard Stripe (ou via
 * `stripe listen --forward-to`/CLI en amont), renseigner `STRIPE_WEBHOOK_SECRET` dans les
 * Environment Variables Vercel de l'environnement `production`. Sans cette étape, AUCUN paiement
 * ne peut débloquer un compte (le webhook répond 503, fail closed — jamais un déblocage sans
 * vérification).
 */
async function verifyAndParseEvent(request: Request): Promise<{ event: Stripe.Event } | { errorResponse: Response }> {
  const rawBody = await request.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");

  if (secret) {
    if (!signature) {
      return { errorResponse: jsonError(400, "VALIDATION_FAILED", "En-tête stripe-signature manquant.") };
    }
    try {
      const event = getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
      return { event };
    } catch (err) {
      console.error(`[stripe-webhook] signature invalide : ${err instanceof Error ? err.message : err}`);
      return { errorResponse: jsonError(400, "VALIDATION_FAILED", "Signature Stripe invalide.") };
    }
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET absente EN PRODUCTION — refus explicite (fail closed). " +
        "Aucun événement Stripe n'est traité tant que ce secret n'est pas configuré (voir en-tête de ce fichier).",
    );
    return { errorResponse: jsonError(503, "INTERNAL_ERROR", "Webhook Stripe non configuré.") };
  }

  console.warn(
    "[stripe-webhook] MODE DEV EXPLICITE — STRIPE_WEBHOOK_SECRET absente : signature NON vérifiée, " +
      "corps de requête accepté tel quel. JAMAIS ce comportement en production (voir en-tête de ce fichier).",
  );
  try {
    const event = JSON.parse(rawBody) as Stripe.Event;
    return { event };
  } catch {
    return { errorResponse: jsonError(400, "VALIDATION_FAILED", "Corps de requête JSON invalide.") };
  }
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "Content-Type": "application/json" } });
}

function currentPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const seconds = subscription.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** Idempotence (ADR-009 §2) : `stripe_events.id` = id d'événement Stripe, clé primaire. Un
 * événement déjà présent est acquitté sans retraitement (`insert` échoue sur `23505`, capturé). */
async function alreadyProcessed(admin: SupabaseClient<Database>, event: Stripe.Event): Promise<boolean> {
  const { data, error } = await admin.from("stripe_events").select("id, processed_at").eq("id", event.id).maybeSingle();
  if (error) throw new Error(`alreadyProcessed: stripe_events — ${error.message}`);
  return data?.processed_at != null;
}

async function recordEvent(admin: SupabaseClient<Database>, event: Stripe.Event, args: { error?: string } = {}): Promise<void> {
  const { error } = await admin.from("stripe_events").upsert(
    {
      id: event.id,
      type: event.type,
      api_version: event.api_version ?? null,
      event_created: new Date(event.created * 1000).toISOString(),
      payload: event as unknown as Json,
      processed_at: args.error ? null : new Date().toISOString(),
      error: args.error ?? null,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`recordEvent: stripe_events — ${error.message}`);
}

/**
 * Ordre de livraison (ADR-009 §2 : « l'ordre est géré en ne persistant que si `event.created` est
 * postérieur au dernier événement traité pour cet abonnement »).
 *
 * Correction post-revue (finding I2) : la version précédente relisait les 50 derniers
 * `stripe_events` TOUS ABONNEMENTS CONFONDUS pour retrouver le dernier événement connu d'UN
 * abonnement — avec quelques dizaines d'utilisateurs actifs, l'événement précédent d'un abonnement
 * sortait de cette fenêtre en quelques heures, la fonction répondait alors `false` (« pas
 * obsolète ») et un événement livré hors ordre pouvait écraser un état plus récent. Ce n'était pas
 * une simple limite de volumétrie mais une faille de correction, dès la première dizaine
 * d'utilisateurs. `subscriptions.last_event_created` (migration 0013) porte désormais, PAR
 * ABONNEMENT, `event.created` du dernier événement effectivement appliqué : lecture indexée d'une
 * seule ligne, correcte quel que soit le nombre d'abonnements ou d'événements cumulés.
 *
 * Lecture/écriture non atomiques (limite assumée) : deux livraisons concurrentes du même
 * abonnement peuvent encore se chevaucher entre cette lecture et l'`update()` d'`upsertSubscriptionState()`
 * — un vrai verrou nécessiterait une fonction Postgres dédiée (`select ... for update`), hors
 * budget de cette correction. Le risque résiduel est un état légèrement désynchronisé sur une
 * fenêtre de quelques centaines de millisecondes, jamais une régression de sécurité (le tier ne
 * peut être élevé que par un événement Stripe réel).
 */
async function isStaleForSubscription(admin: SupabaseClient<Database>, event: Stripe.Event, subscriptionId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("last_event_created")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(`isStaleForSubscription: subscriptions — ${error.message}`);
  if (!data?.last_event_created) return false; // aucun événement encore appliqué pour cet abonnement.

  return new Date(data.last_event_created).getTime() >= event.created * 1000;
}

/**
 * `customer.subscription.created` | `.updated` | `.deleted` — écrit `subscriptions`, `tier` selon
 * `status`. `eventCreated` (l'horodatage de l'événement Stripe QUI DÉCLENCHE cette écriture, pas un
 * dérivé de l'objet `subscription` lui-même) alimente `last_event_created` — voir
 * `isStaleForSubscription()` (finding I2).
 */
async function upsertSubscriptionState(admin: SupabaseClient<Database>, subscription: Stripe.Subscription, eventCreated: Date): Promise<string | null> {
  const tier = ACTIVE_LIKE_STATUSES.has(subscription.status) ? "premium" : "free";
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const { data, error } = await admin
    .from("subscriptions")
    .update({
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      tier,
      price_id: subscription.items.data[0]?.price.id ?? null,
      current_period_end: currentPeriodEndIso(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end,
      last_event_created: eventCreated.toISOString(),
    })
    .eq("stripe_customer_id", customerId)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error(`upsertSubscriptionState: subscriptions — ${error.message}`);

  if (!data) {
    // Ne devrait jamais arriver (`subscription-intent` crée toujours la ligne AVANT que Stripe
    // n'émette un événement) — journalisé plutôt que silencieux, aucune ligne à mettre à jour sans
    // `user_id` connu (ADR-010 : jamais de compte fabriqué depuis un webhook).
    console.error(`[stripe-webhook] aucune ligne subscriptions pour stripe_customer_id=${customerId} — événement ignoré.`);
    return null;
  }
  return data.user_id;
}

async function handleEvent(admin: SupabaseClient<Database>, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      if (await isStaleForSubscription(admin, event, subscription.id)) {
        console.warn(`[stripe-webhook] événement ${event.id} (${event.type}) plus ancien qu'un événement déjà traité pour ${subscription.id} — ignoré.`);
        return;
      }
      await upsertSubscriptionState(admin, subscription, new Date(event.created * 1000));
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      if (!subscriptionId) return; // facture hors abonnement (achat ponctuel) — hors périmètre AC13.

      if (await isStaleForSubscription(admin, event, subscriptionId)) {
        console.warn(`[stripe-webhook] événement ${event.id} (${event.type}) plus ancien qu'un événement déjà traité pour ${subscriptionId} — ignoré.`);
        return;
      }

      const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
      const userId = await upsertSubscriptionState(admin, subscription, new Date(event.created * 1000));

      if (event.type === "invoice.payment_failed" && userId) {
        await notifyUser(admin, {
          userId,
          type: "payment_failed",
          title: "Ton paiement a échoué",
          body: "Vérifie ton moyen de paiement depuis l'écran Facturation pour garder ton accès illimité.",
          deepLink: "/facturation",
        });
      }
      return;
    }
    default:
      // Événement reçu mais non traité par ce lot — acquitté (200) sans effet, jamais un échec.
      return;
  }
}

export async function POST(request: Request) {
  const verified = await verifyAndParseEvent(request);
  if ("errorResponse" in verified) return verified.errorResponse;
  const { event } = verified;

  const admin = createSupabaseServiceRoleClient();

  if (await alreadyProcessed(admin, event)) {
    return new Response(JSON.stringify({ received: true, deduplicated: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  try {
    await handleEvent(admin, event);
    await recordEvent(admin, event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] échec de traitement de l'événement ${event.id} (${event.type}) : ${message}`);
    await recordEvent(admin, event, { error: message }).catch((recordError) =>
      console.error(`[stripe-webhook] échec d'enregistrement de l'échec lui-même : ${recordError instanceof Error ? recordError.message : recordError}`),
    );
    // 500 : Stripe rejoue automatiquement un webhook en échec (ADR-009 §2, R10) — un job/événement
    // corrompu redevient visible et rejouable plutôt que silencieusement perdu.
    return jsonError(500, "INTERNAL_ERROR", "Échec du traitement de l'événement Stripe.");
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
