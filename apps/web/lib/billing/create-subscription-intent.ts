import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { SubscriptionIntentResponse } from "@hybride/domain";

import { getMonthlyPriceId, getStripeClient } from "../stripe";

export class AlreadySubscribedError extends Error {}
export class MissingEmailError extends Error {}

const ACTIVE_LIKE_STATUSES = new Set(["active", "trialing"]);

/**
 * `POST /api/v1/billing/subscription-intent` ET `SubscriptionPage` (Server Component, écran
 * Abonnement) partagent cette logique — évite un aller-retour HTTP interne pour monter le Payment
 * Element au premier rendu de la page (même pattern que `read-today-plan.ts`/`readLatestPlanDiff`).
 * Voir la route pour le détail des garanties ADR-009 §1/§2 (aucune donnée de santé transmise,
 * l'accès n'est débloqué que par le webhook).
 */
export async function createOrReuseSubscriptionIntent(
  admin: SupabaseClient<Database>,
  args: { userId: string; email: string | null | undefined },
): Promise<SubscriptionIntentResponse> {
  const { userId, email } = args;
  if (!email) throw new MissingEmailError("createOrReuseSubscriptionIntent: adresse e-mail introuvable pour ce compte.");

  const stripe = getStripeClient();

  const { data: existing, error: existingError } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, tier")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(`createOrReuseSubscriptionIntent: subscriptions — ${existingError.message}`);

  if (existing?.tier === "premium" && existing.status && ACTIVE_LIKE_STATUSES.has(existing.status)) {
    throw new AlreadySubscribedError("createOrReuseSubscriptionIntent: un abonnement actif existe déjà.");
  }

  let customerId = existing?.stripe_customer_id ?? null;
  if (!customerId) {
    // ADR-009 §1 — SEULE donnée transmise : l'e-mail. `metadata.app_user_id` est un identifiant de
    // réconciliation interne, jamais une donnée de santé ou d'entraînement.
    const customer = await stripe.customers.create({ email, metadata: { app_user_id: userId } });
    customerId = customer.id;
  }

  let subscription: Stripe.Subscription;
  if (existing?.stripe_subscription_id) {
    const retrieved = await stripe.subscriptions.retrieve(existing.stripe_subscription_id, { expand: ["latest_invoice.confirmation_secret"] });
    subscription =
      retrieved.status === "incomplete"
        ? retrieved
        : await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: getMonthlyPriceId() }],
            payment_behavior: "default_incomplete",
            payment_settings: { save_default_payment_method: "on_subscription" },
            expand: ["latest_invoice.confirmation_secret"],
          });
  } else {
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: getMonthlyPriceId() }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
    });
  }

  const { error: upsertError } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      price_id: getMonthlyPriceId(),
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw new Error(`createOrReuseSubscriptionIntent: subscriptions (upsert) — ${upsertError.message}`);

  const invoice = subscription.latest_invoice as Stripe.Invoice | null;
  const clientSecret = invoice?.confirmation_secret?.client_secret;
  if (!clientSecret) {
    throw new Error("createOrReuseSubscriptionIntent: Stripe n'a pas renvoyé de secret de confirmation exploitable.");
  }

  return { clientSecret, subscriptionId: subscription.id };
}
