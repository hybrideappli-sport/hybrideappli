import type { BillingOfferResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getBillingOffer } from "@/lib/billing/get-offer";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/billing/offer` — AC13, ADR-009 §3. Lit le `Price` Stripe (`STRIPE_PRICE_ID_MONTHLY`)
 * : **aucun montant en dur** dans ce fichier ni dans aucun composant (`OfferCard`). Le fondateur
 * peut changer le tarif dans le Dashboard Stripe sans déploiement.
 */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const body = await getBillingOffer();
  return apiJson<BillingOfferResponse>(body, { headers: { "Cache-Control": "no-store" } });
}
