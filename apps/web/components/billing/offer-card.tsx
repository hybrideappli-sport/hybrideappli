import type { BillingOfferResponse } from "@hybride/domain";

/**
 * `OfferCard` — AC13, ADR-009 §3. Prix **lu depuis `/billing/offer`** (Stripe), aucun montant en
 * dur. Argumentaire qualitatif uniquement (24/7, adaptation continue) — jamais de comparaison de
 * prix avec un coach humain (cadrage produit du 2026-08-04).
 */
export function OfferCard({ offer }: { offer: BillingOfferResponse }) {
  const formattedAmount = new Intl.NumberFormat("fr-FR", { style: "currency", currency: offer.currency.toUpperCase() }).format(
    offer.amountCents / 100,
  );
  const intervalLabel = offer.interval === "year" ? "an" : offer.interval === "week" ? "semaine" : "mois";

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4" data-testid="offer-card">
      <p className="text-2xl font-semibold text-neutral-900">
        {formattedAmount}
        <span className="text-sm font-normal text-neutral-500"> / {intervalLabel}</span>
      </p>
      {offer.trialDays ? <p className="mt-1 text-xs text-neutral-500">{offer.trialDays} jours d&apos;essai avant le premier prélèvement.</p> : null}
      <ul className="mt-3 flex flex-col gap-1 text-sm text-neutral-700">
        <li>Ton coach reste disponible 24/7, jamais seulement à un créneau de rendez-vous.</li>
        <li>Il s&apos;adapte en continu à ta réalité — signaux de fatigue, douleur, vie quotidienne.</li>
        <li>Chaque recommandation est explicable : tu sais toujours pourquoi.</li>
      </ul>
    </div>
  );
}
