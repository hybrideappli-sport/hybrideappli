/**
 * Contrats Stripe (Lot L5 — AC13, ADR-009). **Aucun montant en dur** : `amountCents`/`currency`/
 * `interval` sont toujours lus depuis le `Price` Stripe par le serveur (`GET /billing/offer`),
 * jamais écrits en constante dans ce fichier ni dans un composant.
 */

export interface BillingOfferResponse {
  priceId: string;
  amountCents: number;
  currency: string;
  interval: string; // 'month' | 'year' — tel que renvoyé par Stripe
  intervalCount: number;
  trialDays: number | null;
}

export interface SubscriptionIntentResponse {
  clientSecret: string;
  subscriptionId: string;
}

export interface InvoiceView {
  id: string;
  number: string | null;
  amountDueCents: number;
  currency: string;
  status: string;
  created: string; // ISO datetime
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface InvoicesResponse {
  invoices: InvoiceView[];
}
