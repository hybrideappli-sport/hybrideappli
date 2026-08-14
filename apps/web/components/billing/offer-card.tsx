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
    <div className="rounded-xl bg-surface p-5" data-testid="offer-card">
      <p className="font-serif text-display text-foreground">
        {formattedAmount}
        <span className="text-body font-sans font-normal text-foreground-muted"> / {intervalLabel}</span>
      </p>
      {offer.trialDays ? <p className="mt-1 text-caption text-foreground-subtle">{offer.trialDays} jours d&apos;essai avant le premier prélèvement.</p> : null}
      <ul className="mt-4 flex flex-col gap-2 text-body text-foreground-muted">
        <li className="flex gap-2">
          <span aria-hidden="true" className="text-success">✓</span>
          Ton coach reste disponible 24/7, jamais seulement à un créneau de rendez-vous.
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true" className="text-success">✓</span>
          Il s&apos;adapte en continu à ta réalité — signaux de fatigue, douleur, vie quotidienne.
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true" className="text-success">✓</span>
          Chaque recommandation est explicable : tu sais toujours pourquoi.
        </li>
      </ul>
    </div>
  );
}
