"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * `D-upsell` — AC13 : disparaît dès `tier = 'premium'`. Argumentaire qualitatif UNIQUEMENT
 * (disponibilité 24/7, adaptation continue) — jamais de comparaison de prix avec un coach humain
 * (cadrage produit du 2026-08-04, `07-spec-feature1-coach-ia.md` §1/§7).
 *
 * La maquette ouvre sur un titre SERIF — « Ton plan du jour reste gratuit. » — et ferme sur un
 * CTA en pill. Le code rendait un paragraphe gris avec un lien souligné au milieu : le bloc le
 * plus commercial de l'écran était aussi le plus muet. Le titre pose d'abord ce qui reste
 * gratuit, avant de proposer l'abonnement : c'est l'ordre « non punitif » de `Yf6zY`.
 */
export function UpsellBanner({ tier }: { tier: "free" | "premium" }) {
  const [dismissed, setDismissed] = useState(false);
  if (tier === "premium" || dismissed) return null;

  return (
    <Card data-testid="upsell-banner">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <CardTitle className="font-serif text-title text-foreground">
          Ton plan du jour reste gratuit.
        </CardTitle>
        <button
          type="button"
          className="-mr-1 -mt-1 shrink-0 text-caption text-foreground-subtle hover:text-foreground-muted"
          onClick={() => setDismissed(true)}
          aria-label="Fermer ce message"
        >
          Fermer
        </button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-body text-foreground-muted">
          Ton coach est disponible 24/7 et s&apos;adapte en continu à ta réalité. L&apos;abonnement
          ouvre ta semaine complète et la vision macro jusqu&apos;à ton objectif.
        </p>
        {/* Pill plein comme dans `D-upsell-cta`, mais en largeur contenue et non pleine largeur :
            le CTA pleine largeur est déjà pris par « Voir ma séance du jour » en haut d'écran.
            La maquette fait le même arbitrage — `u7GEl` n'a pas de `fill_container`. */}
        <Button asChild size="sm" className="w-fit">
          <Link href="/abonnement" data-testid="upsell-cta">
            Découvrir l&apos;abonnement
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
