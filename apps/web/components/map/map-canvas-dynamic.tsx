"use client";

import dynamic from "next/dynamic";

import type { MapCanvasProps } from "./map-canvas";

/**
 * `ssr: false` n'est PAS autorisé dans un Server Component (Next.js 16, `next/dynamic` — voir
 * `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`) : il doit vivre dans un module
 * Client. C'est tout le rôle de ce fichier — `app/(app)/carte/page.tsx` (Server Component) importe
 * `MapCanvasDynamic`, jamais `MapCanvas` directement.
 *
 * `maplibre-gl` est une dépendance lourde (ADR-018, Conséquences) : le chargement différé, réservé
 * à la seule route `/carte`, garantit qu'elle ne pèse jamais sur le bundle du Dashboard ni d'aucun
 * autre écran.
 */
export const MapCanvasDynamic = dynamic<MapCanvasProps>(() => import("./map-canvas").then((mod) => mod.MapCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background" data-testid="map-loading">
      <p className="text-label text-foreground-muted">CHARGEMENT DE LA CARTE…</p>
    </div>
  ),
});
