import type { Metadata } from "next";
import Link from "next/link";

import { MapCanvasDynamic } from "@/components/map/map-canvas-dynamic";
import { getMapTilesConfig, MissingMapTilesConfigurationError } from "@/lib/map/tiles-config";

export const metadata: Metadata = { title: "Carte — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `/carte` — ADR-018, lot L1 (« Socle carte »). Sous-écran au sens du patron `Yf6zY` : PAS de tab
 * bar (`components/layout/tab-bar.tsx` ne rend rien hors des 4 écrans racines), fermeture explicite
 * qui ramène à `/planning` — PAS `/dashboard`, contrairement aux autres sous-écrans : c'est
 * `/planning` qui porte le point d'entrée (ADR-018, question ouverte n°1, tranchée).
 *
 * Garde fail-closed `MAP_TILES_PLAN` : déjà appliqué EN AMONT par `apps/web/proxy.ts`, avant tout
 * travail (503 explicite si `NODE_ENV=production` et le palier n'est pas commercial) — ce composant
 * suppose donc toujours avoir reçu ce feu vert.
 *
 * `<MapCanvasDynamic>` (client, `next/dynamic` `ssr: false`) est le SEUL point qui parle à MapLibre :
 * ce Server Component ne fait qu'une chose côté données — résoudre l'URL de style — puis rend un
 * cadre plein écran par-dessus le reste de l'app (`fixed inset-0`), quel que soit le `pb-16` du
 * layout parent (`app/(app)/layout.tsx`).
 */
export default function MapPage() {
  let styleUrl: string;
  try {
    styleUrl = getMapTilesConfig().styleUrl;
  } catch (error) {
    if (!(error instanceof MissingMapTilesConfigurationError)) throw error;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <CarteHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center" data-testid="map-config-unavailable">
          <p className="text-label text-danger">CARTE INDISPONIBLE</p>
          <p className="text-body text-foreground-muted">La configuration du fond de carte est incomplète dans cet environnement.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <CarteHeader />
      <div className="relative flex-1">
        <MapCanvasDynamic styleUrl={styleUrl} />
      </div>
    </div>
  );
}

function CarteHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-surface-sunken px-5">
      <p className="text-label text-foreground-muted">CARTE</p>
      <Link
        href="/planning"
        aria-label="Fermer"
        data-testid="carte-close-button"
        className="flex size-11 items-center justify-center text-foreground-muted hover:text-foreground"
      >
        <span aria-hidden="true">✕</span>
      </Link>
    </header>
  );
}
