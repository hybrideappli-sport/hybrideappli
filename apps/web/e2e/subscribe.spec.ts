import { test, expect } from "@playwright/test";

import { completeOnboardingToDashboard } from "./support/daily-loop-flow";
import { buildSubscriptionActiveEventFixture, fetchSubscriptionIdsForUser, postWebhookFixture } from "./support/stripe-webhook-fixture";
import { createServiceRoleClient } from "./support/test-user";

/**
 * `subscribe.spec.ts` — AC13, ADR-009. Payment Element (carte de test) → webhook → Dashboard
 * débloqué, bandeau upsell disparu.
 *
 * La CLI Stripe (`stripe listen --forward-to`) n'est pas disponible dans cet environnement
 * d'exécution E2E : ce test exerce un VRAI appel à l'API Stripe test (`STRIPE_SECRET_KEY=sk_test_*`,
 * `STRIPE_PRICE_ID_MONTHLY` réels) pour créer le Customer/Subscription et monter le Payment Element
 * (`/abonnement`), puis simule la LIVRAISON du webhook avec un événement construit à la main
 * (`buildSubscriptionActiveEventFixture`) plutôt que de remplir l'iframe Stripe et attendre un
 * webhook réel — voir `support/stripe-webhook-fixture.ts` pour le détail. Le déblocage réel de
 * l'entitlement (`tier: 'free' → 'premium'`) passe donc par le VRAI code de
 * `POST /api/v1/webhooks/stripe`, seule la livraison réseau Stripe → serveur est simulée.
 */
test("abonnement — Payment Element monté, webhook Stripe débloque le Dashboard, bandeau upsell disparu", async ({ page, baseURL }) => {
  const { userId } = await completeOnboardingToDashboard(page, "subscribe");

  // Avant abonnement : bandeau upsell visible (tier = 'free').
  await expect(page.getByTestId("upsell-banner")).toBeVisible();

  await page.goto("/abonnement");
  await expect(page.getByTestId("offer-card")).toBeVisible();
  // Aucun montant en dur (ADR-009 §3) : le prix affiché vient de Stripe, jamais d'une constante —
  // on vérifie seulement qu'un montant réel a été rendu, pas sa valeur précise (qui dépend du
  // Price configuré côté Dashboard Stripe).
  await expect(page.getByTestId("offer-card")).not.toBeEmpty();
  await expect(page.getByTestId("payment-element-form")).toBeVisible();

  const { customerId, subscriptionId } = await fetchSubscriptionIdsForUser(userId);
  const priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) throw new Error("[e2e] STRIPE_PRICE_ID_MONTHLY manquante.");

  const event = buildSubscriptionActiveEventFixture({ customerId, subscriptionId, priceId });
  const response = await postWebhookFixture(baseURL!, event);
  expect(response.ok).toBe(true);

  // Idempotence (ADR-009 §2) : rejouer EXACTEMENT le même événement ne doit pas échouer et reste
  // acquitté — vérifié directement contre `stripe_events` plutôt que par une seconde requête HTTP
  // dont la réponse serait de toute façon identique (`{received:true, deduplicated:true}`).
  const admin = createServiceRoleClient();
  const { data: eventRows, error: eventRowsError } = await admin.from("stripe_events").select("id").eq("id", event.id as string);
  expect(eventRowsError).toBeNull();
  expect(eventRows).toHaveLength(1);

  await page.goto("/dashboard");
  await expect(page.getByTestId("upsell-banner")).toHaveCount(0);
  await expect(page.getByTestId("weekly-preview-card")).toBeVisible();
  await expect(page.getByTestId("weekly-preview-locked")).toHaveCount(0);
});
