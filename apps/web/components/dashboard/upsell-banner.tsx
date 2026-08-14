"use client";

import { useState } from "react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";

/**
 * `UpsellBanner` — AC13 : disparaît dès `tier = 'premium'`. Argumentaire qualitatif UNIQUEMENT
 * (disponibilité 24/7, adaptation continue) — jamais de comparaison de prix avec un coach humain
 * (cadrage produit du 2026-08-04, `07-spec-feature1-coach-ia.md` §1/§7).
 */
export function UpsellBanner({ tier }: { tier: "free" | "premium" }) {
  const [dismissed, setDismissed] = useState(false);
  if (tier === "premium" || dismissed) return null;

  return (
    <Card data-testid="upsell-banner">
      <CardContent className="flex items-center justify-between gap-3 pt-5 text-body text-foreground-muted">
        <p>
          Ton coach est disponible 24/7 et s&apos;adapte en continu à ta réalité.{" "}
          <Link href="/abonnement" className="text-body-strong font-semibold text-accent underline underline-offset-2" data-testid="upsell-cta">
            Passe en illimité
          </Link>{" "}
          pour débloquer ta semaine complète.
        </p>
        <button
          type="button"
          className="shrink-0 text-caption text-foreground-subtle hover:text-foreground-muted"
          onClick={() => setDismissed(true)}
          aria-label="Fermer ce message"
        >
          Fermer
        </button>
      </CardContent>
    </Card>
  );
}
