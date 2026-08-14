import type { Metadata } from "next";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { OfferCard } from "@/components/billing/offer-card";
import { PaymentElementForm } from "@/components/billing/payment-element-form";
import { createOrReuseSubscriptionIntent } from "@/lib/billing/create-subscription-intent";
import { getBillingOffer } from "@/lib/billing/get-offer";
import { getEntitlement } from "@/lib/entitlements";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Abonnement — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `SubscriptionPage` (AC13, ADR-009) — accessible depuis le bandeau upsell du Dashboard, pas dans
 * le funnel initial (`04-flow.md`). Prix lu depuis Stripe (`OfferCard`), `PaymentElement` monté
 * dès le rendu serveur (`createOrReuseSubscriptionIntent()`, partagé avec la route API).
 */
export default async function SubscriptionPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const entitlement = await getEntitlement(admin, { userId: user.id, now });

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (entitlement.tier === "premium") {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
        <h1 className="font-serif text-title text-foreground">Abonnement</h1>
        <p className="text-body text-foreground-muted" data-testid="already-subscribed">
          Ton abonnement est déjà actif — toutes les fonctionnalités du coach sont débloquées.
        </p>
      </main>
    );
  }

  if (!publishableKey) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 py-8">
        <h1 className="font-serif text-title text-foreground">Abonnement</h1>
        <p role="alert" className="text-small text-danger">
          Le paiement est momentanément indisponible. Réessaie dans quelques instants.
        </p>
      </main>
    );
  }

  const [offer, intent] = await Promise.all([
    getBillingOffer(),
    createOrReuseSubscriptionIntent(admin, { userId: user.id, email: user.email }),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-5 py-8">
      <h1 className="font-serif text-title text-foreground">Débloquer ton coach en illimité</h1>
      <OfferCard offer={offer} />
      <PaymentElementForm clientSecret={intent.clientSecret} publishableKey={publishableKey} />
    </main>
  );
}
