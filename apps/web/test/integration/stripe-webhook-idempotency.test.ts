import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/v1/webhooks/stripe/route";
import { createTestUser, deleteTestUser, serviceRoleClient } from "./support/test-clients";

/**
 * `stripe-webhook-idempotency.test.ts` (finding I13, `plans/US-01-...md` §4.3) — « même événement
 * rejoué 3 fois ⟹ un seul traitement ». Exerce directement le `POST` exporté par la route (Request
 * standard, aucune dépendance à `next/headers`/cookies — ce webhook est strictement `service_role`,
 * voir son en-tête) plutôt qu'un serveur Next complet.
 *
 * `NODE_ENV=test` (positionné par Vitest) fait entrer `verifyAndParseEvent()` dans sa branche
 * « mode dev » (aucun `STRIPE_WEBHOOK_SECRET` en local, voir `.env.local.example`) : le corps est
 * lu en JSON brut, sans vérification de signature — suffisant pour exercer la logique
 * d'idempotence, qui est indépendante de la vérification de signature.
 */
const admin = serviceRoleClient();

const user = await createTestUser("stripe-idem");

afterAll(async () => {
  await deleteTestUser(user.id);
});

const stripeCustomerId = `cus_test_${randomUUID().slice(0, 8)}`;
const stripeSubscriptionId = `sub_test_${randomUUID().slice(0, 8)}`;

// `upsertSubscriptionState()` ne fait qu'un UPDATE (jamais d'INSERT, ADR-010 : jamais de compte
// fabriqué depuis un webhook) : la ligne `subscriptions` doit préexister, comme le fait réellement
// `POST /billing/subscription-intent` avant que Stripe n'émette le moindre événement.
const { error: seedError } = await admin.from("subscriptions").upsert({ user_id: user.id, stripe_customer_id: stripeCustomerId, tier: "free" });
if (seedError) throw new Error(`[test] subscriptions (seed) : ${seedError.message}`);

function buildEvent(eventId: string) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    id: eventId,
    object: "event",
    type: "customer.subscription.created",
    api_version: "2024-06-20",
    created: nowSeconds,
    data: {
      object: {
        id: stripeSubscriptionId,
        object: "subscription",
        customer: stripeCustomerId,
        status: "active",
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_test_monthly" }, current_period_end: nowSeconds + 30 * 86_400 }] },
      },
    },
  };
}

function postWebhook(body: unknown) {
  return POST(new Request("http://localhost/api/v1/webhooks/stripe", { method: "POST", body: JSON.stringify(body) }));
}

describe("stripe-webhook-idempotency", () => {
  it("un même événement rejoué 3 fois n'est traité qu'une seule fois (stripe_events.id, PK)", async () => {
    const eventId = `evt_test_${randomUUID().slice(0, 8)}`;
    const event = buildEvent(eventId);

    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { received: boolean; deduplicated?: boolean };
    expect(firstBody.received).toBe(true);
    expect(firstBody.deduplicated).toBeUndefined();

    const second = await postWebhook(event);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { received: boolean; deduplicated?: boolean };
    expect(secondBody.deduplicated).toBe(true);

    const third = await postWebhook(event);
    expect(third.status).toBe(200);
    const thirdBody = (await third.json()) as { received: boolean; deduplicated?: boolean };
    expect(thirdBody.deduplicated).toBe(true);

    const { data: eventRows, error: eventRowsError } = await admin.from("stripe_events").select("id, processed_at").eq("id", eventId);
    if (eventRowsError) throw eventRowsError;
    expect(eventRows).toHaveLength(1);
    expect(eventRows![0]!.processed_at).not.toBeNull();

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("tier, status, stripe_subscription_id, last_event_created")
      .eq("user_id", user.id)
      .single();
    if (subscriptionError) throw subscriptionError;
    expect(subscription.tier).toBe("premium");
    expect(subscription.status).toBe("active");
    expect(subscription.stripe_subscription_id).toBe(stripeSubscriptionId);
    expect(subscription.last_event_created).not.toBeNull();
  });

  it("un événement PLUS ANCIEN que le dernier appliqué pour cet abonnement est ignoré (finding I2)", async () => {
    // L'abonnement porte déjà `last_event_created` du test précédent (même fixture `user`) :
    // un événement `created` antérieur, même avec un `id` JAMAIS vu, doit être écarté sans
    // modifier `subscriptions` (ordre de livraison, ADR-009 §2).
    const staleEventId = `evt_test_${randomUUID().slice(0, 8)}`;
    const staleEvent = buildEvent(staleEventId);
    staleEvent.created -= 3600; // 1h avant l'événement déjà appliqué.
    staleEvent.data.object.status = "canceled"; // si l'événement était appliqué à tort, `tier` retomberait à 'free'.

    const response = await postWebhook(staleEvent);
    expect(response.status).toBe(200);

    const { data: subscription, error } = await admin.from("subscriptions").select("tier, status").eq("user_id", user.id).single();
    if (error) throw error;
    expect(subscription.tier).toBe("premium");
    expect(subscription.status).toBe("active");
  });
});
