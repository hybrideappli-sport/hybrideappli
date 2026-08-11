import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/v1/webhooks/stripe/route";
import { getEntitlement } from "@/lib/entitlements";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { createTestUser, deleteTestUser, serviceRoleClient } from "./support/test-clients";

/**
 * `entitlement-unlock.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC13) — le webhook
 * `customer.subscription.created` lève IMMÉDIATEMENT les limitations d'accès libre : pas de délai,
 * pas de rafraîchissement manuel nécessaire. Vérifie l'état AVANT/APRÈS via `getEntitlement()`
 * (la même fonction que consultent toutes les routes de lecture de plan), pas seulement l'état brut
 * de `subscriptions`.
 */
const admin = serviceRoleClient();

const user = await createTestUser("entitlement-unlock");

afterAll(async () => {
  await deleteTestUser(user.id);
});

const stripeCustomerId = `cus_test_${randomUUID().slice(0, 8)}`;
const { error: seedError } = await admin.from("subscriptions").upsert({ user_id: user.id, stripe_customer_id: stripeCustomerId, tier: "free" });
if (seedError) throw new Error(`[test] subscriptions (seed) : ${seedError.message}`);

describe("entitlement-unlock — AC13", () => {
  it("avant tout webhook, l'utilisateur est en tier 'free' avec un accès plafonné", async () => {
    const now = todayInTimezone("Europe/Paris");
    const entitlement = await getEntitlement(admin, { userId: user.id, now });
    expect(entitlement.tier).toBe("free");
    expect(entitlement.canViewWeek).toBe(false);
    expect(entitlement.canViewMacro).toBe(false);
    expect(Number.isFinite(entitlement.freeAccess.remaining)).toBe(true);
  });

  it("customer.subscription.created (status='active') lève les limitations immédiatement", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const event = {
      id: `evt_test_${randomUUID().slice(0, 8)}`,
      object: "event",
      type: "customer.subscription.created",
      api_version: "2024-06-20",
      created: nowSeconds,
      data: {
        object: {
          id: `sub_test_${randomUUID().slice(0, 8)}`,
          object: "subscription",
          customer: stripeCustomerId,
          status: "active",
          cancel_at_period_end: false,
          items: { data: [{ price: { id: "price_test_monthly" }, current_period_end: nowSeconds + 30 * 86_400 }] },
        },
      },
    };

    const response = await POST(new Request("http://localhost/api/v1/webhooks/stripe", { method: "POST", body: JSON.stringify(event) }));
    expect(response.status).toBe(200);

    const now = todayInTimezone("Europe/Paris");
    const entitlement = await getEntitlement(admin, { userId: user.id, now });
    expect(entitlement.tier).toBe("premium");
    expect(entitlement.canViewToday).toBe(true);
    expect(entitlement.canViewWeek).toBe(true);
    expect(entitlement.canViewMacro).toBe(true);
    expect(entitlement.freeAccess.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("customer.subscription.deleted (annulation) referme les limitations immédiatement", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000) + 10; // postérieur à l'événement précédent (ordre de livraison).
    const event = {
      id: `evt_test_${randomUUID().slice(0, 8)}`,
      object: "event",
      type: "customer.subscription.deleted",
      api_version: "2024-06-20",
      created: nowSeconds,
      data: {
        object: {
          id: `sub_test_${randomUUID().slice(0, 8)}`,
          object: "subscription",
          customer: stripeCustomerId,
          status: "canceled",
          cancel_at_period_end: false,
          items: { data: [{ price: { id: "price_test_monthly" }, current_period_end: nowSeconds }] },
        },
      },
    };

    const response = await POST(new Request("http://localhost/api/v1/webhooks/stripe", { method: "POST", body: JSON.stringify(event) }));
    expect(response.status).toBe(200);

    const now = todayInTimezone("Europe/Paris");
    const entitlement = await getEntitlement(admin, { userId: user.id, now });
    expect(entitlement.tier).toBe("free");
    expect(entitlement.canViewWeek).toBe(false);
  });
});
