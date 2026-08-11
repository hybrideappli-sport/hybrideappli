"use client";

import { useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { Button } from "@/components/ui/button";

/** Chargé une seule fois — `loadStripe()` mémoïse déjà en interne, ce module-level évite un rechargement à chaque montage. */
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}

/**
 * `PaymentElementForm` — Stripe Elements embarqué (ADR-009 §1) : les données de carte ne
 * transitent jamais par nos serveurs (PCI-DSS SAQ A). États chargement/refus explicites
 * (`04-flow.md`, écran Paiement abonnement).
 */
export function PaymentElementForm({ clientSecret, publishableKey }: { clientSecret: string; publishableKey: string }) {
  return (
    <Elements stripe={getStripePromise(publishableKey)} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setPending(true);
    setError(null);

    // AC13 — état « paiement refusé » explicite (`04-flow.md`). L'accès n'est de toute façon
    // JAMAIS débloqué par ce retour navigateur (ADR-009 §2) : `return_url` ramène sur le Dashboard,
    // qui reste bloqué tant que le webhook n'a pas confirmé l'abonnement.
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/dashboard` },
    });

    if (confirmError) {
      setError(confirmError.message ?? "Le paiement a été refusé. Vérifie tes informations et réessaie.");
      setPending(false);
    }
    // Succès : Stripe redirige lui-même vers `return_url` — aucun état de succès local à gérer ici.
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="payment-element-form">
      <PaymentElement />
      {error ? (
        <p role="alert" className="text-sm text-red-600" data-testid="payment-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!stripe || !elements || pending} data-testid="payment-submit">
        {pending ? "Traitement en cours…" : "Payer et activer mon abonnement"}
      </Button>
    </form>
  );
}
