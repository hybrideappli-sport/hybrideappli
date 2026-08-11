import { createServiceRoleClient } from "./test-user";

/**
 * Support E2E `subscribe.spec.ts` — ADR-009 §"Alternatives écartées" prévoit explicitement que
 * « le test E2E de paiement nécessite la CLI Stripe (`stripe listen`) ou des fixtures de webhook en
 * environnement de test ». `stripe listen` n'est pas disponible dans cet environnement d'exécution
 * (pas de CLI Stripe installable/persistante) : ce module construit à la main l'événement Stripe
 * qu'un webhook réel aurait délivré, et le POST directement sur `/api/v1/webhooks/stripe` — qui
 * l'accepte en MODE DEV EXPLICITE tant que `STRIPE_WEBHOOK_SECRET` est absente (voir l'en-tête de
 * cette route, même principe que le mock déterministe `@hybride/coach-llm`). Ce test exerce donc
 * le VRAI code du webhook (parsing, idempotence, bascule `tier`), uniquement la LIVRAISON réseau
 * Stripe → notre serveur est simulée plutôt qu'attendue en vrai.
 *
 * `customerId`/`subscriptionId` sont RÉELS : créés par un vrai appel à l'API Stripe test
 * (`createOrReuseSubscriptionIntent()`, exécuté par `SubscriptionPage` au chargement de
 * `/abonnement`) — seule la confirmation de paiement (saisie de carte dans l'iframe Stripe) et la
 * livraison du webhook sont simulées, pas la création de la ressource Stripe elle-même.
 */
export async function fetchSubscriptionIdsForUser(userId: string): Promise<{ customerId: string; subscriptionId: string }> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from("subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("user_id", userId).single();
  if (error || !data.stripe_customer_id || !data.stripe_subscription_id) {
    throw new Error(`[e2e] fetchSubscriptionIdsForUser: abonnement introuvable pour user=${userId} (${error?.message ?? "ids manquants"}).`);
  }
  return { customerId: data.stripe_customer_id, subscriptionId: data.stripe_subscription_id };
}

/** Événement `customer.subscription.updated` minimal mais suffisant pour `upsertSubscriptionState()`
 * (`apps/web/app/api/v1/webhooks/stripe/route.ts`) : `id`, `customer`, `status`, `items[0]`. */
export function buildSubscriptionActiveEventFixture(args: { customerId: string; subscriptionId: string; priceId: string }): Record<string, unknown> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    id: `evt_e2e_${Date.now()}`,
    object: "event",
    type: "customer.subscription.updated",
    api_version: "2025-01-01",
    created: nowSeconds,
    data: {
      object: {
        id: args.subscriptionId,
        object: "subscription",
        customer: args.customerId,
        status: "active",
        cancel_at_period_end: false,
        items: {
          object: "list",
          data: [{ id: "si_e2e_fixture", current_period_end: nowSeconds + 30 * 24 * 60 * 60, price: { id: args.priceId } }],
        },
      },
    },
  };
}

export async function postWebhookFixture(baseURL: string, event: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseURL}/api/v1/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
}
