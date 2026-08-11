import "server-only";

import type { BillingOfferResponse } from "@hybride/domain";

import { getMonthlyPriceId, getStripeClient } from "../stripe";

/**
 * `GET /api/v1/billing/offer` et `SubscriptionPage` (Server Component) partagent cette lecture —
 * ADR-009 §3 : le prix vient TOUJOURS de Stripe, jamais d'une constante.
 */
export async function getBillingOffer(): Promise<BillingOfferResponse> {
  const stripe = getStripeClient();
  const price = await stripe.prices.retrieve(getMonthlyPriceId());

  if (price.unit_amount === null) {
    throw new Error("getBillingOffer: le Price Stripe configuré n'a pas de montant fixe exploitable.");
  }

  return {
    priceId: price.id,
    amountCents: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval ?? "month",
    intervalCount: price.recurring?.interval_count ?? 1,
    trialDays: price.recurring?.trial_period_days ?? null,
  };
}
