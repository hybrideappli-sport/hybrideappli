import "server-only";

import Stripe from "stripe";

/**
 * Client Stripe serveur unique (ADR-009). `STRIPE_SECRET_KEY` est réelle en dev/preview/prod
 * (`sk_test_*`/`sk_live_*` selon l'environnement, `08-architecture.md` §9) — contrairement à
 * `MISTRAL_API_KEY`/`STRIPE_WEBHOOK_SECRET`, ce module ne prévoit PAS de repli dégradé : sans
 * `STRIPE_SECRET_KEY`, aucune fonctionnalité de monétisation ne peut fonctionner par définition, un
 * échec explicite au premier appel est préférable à un mock silencieux sur un flux de paiement réel.
 */
let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("getStripeClient: STRIPE_SECRET_KEY absente — aucune fonctionnalité Stripe ne peut fonctionner sans elle.");
  }

  cachedClient = new Stripe(apiKey);
  return cachedClient;
}

/** `STRIPE_PRICE_ID_MONTHLY` — jamais de montant en dur (ADR-009 §3, interdit explicite du plan §6). */
export function getMonthlyPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) {
    throw new Error("getMonthlyPriceId: STRIPE_PRICE_ID_MONTHLY absente.");
  }
  return priceId;
}
