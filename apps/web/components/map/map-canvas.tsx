"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { LocateFixed } from "lucide-react";

import "maplibre-gl/dist/maplibre-gl.css";

import { MAP_ATTRIBUTION_TEXT } from "@/lib/map/attribution";
import { MAPLIBRE_WORKER_URL } from "@/lib/map/worker-url";
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MAX_TILES_PER_SESSION,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM_FOR_TRAILS,
  MAP_VIEWPORT_DEBOUNCE_MS,
} from "@/lib/map/constants";
import { createTileRequestGuard } from "@/lib/map/tile-request-guard";
import { debounce } from "@/lib/map/debounce";

/**
 * `<MapCanvas>` — ADR-018, lot L1. Composant CLIENT réel (chargé via `next/dynamic`, `ssr: false`,
 * voir `map-canvas-dynamic.tsx` — MapLibre dépend de `window`/WebGL, indisponible côté serveur).
 *
 * Périmètre STRICT de ce lot : fond de carte + attribution + recentrage + états `loading` et
 * `zoom_required`. AUCUNE source de tracés, AUCUN appel réseau vers Overpass ou vers notre propre
 * API — le client MapLibre ne parle ici qu'au CDN de tuiles du fournisseur (ADR-018 §3).
 */

type LoadState = "loading" | "ready";
type GeoState = "idle" | "locating" | "denied" | "unavailable";

export interface MapCanvasProps {
  /** URL de style déjà résolue côté serveur (clé publique incluse le cas échéant, `tiles-config.ts`). */
  styleUrl: string;
}

export function MapCanvas({ styleUrl }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [zoomRequired, setZoomRequired] = useState(false);
  const [tileCapReached, setTileCapReached] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>("idle");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // L'auto-détection du worker par MapLibre ne survit pas au bundling (elle renvoie une chaîne
    // vide, et le worker se charge alors depuis la page courante, qui répond du HTML) : on lui
    // fournit l'URL réelle. AVANT toute instanciation de `Map` — le worker est créé avec la
    // première. Voir `lib/map/worker-url.ts` pour le détail du mécanisme.
    setWorkerUrl(MAPLIBRE_WORKER_URL);

    // Question ouverte n°2, 3ᵉ levier : plafond de tuiles par session, le seul point par lequel
    // passent TOUTES les requêtes de tuiles côté client. Créé AVANT la `Map` : `transformRequest`
    // doit exister dès la première requête (le style lui-même, puis chaque tuile).
    const transformRequest = createTileRequestGuard(MAP_MAX_TILES_PER_SESSION, () => setTileCapReached(true));

    const map = new MapLibreMap({
      container,
      style: styleUrl,
      center: MAP_DEFAULT_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      maxZoom: MAP_MAX_ZOOM, // question ouverte n°2, 2ᵉ levier — bornes de zoom
      attributionControl: { compact: false, customAttribution: MAP_ATTRIBUTION_TEXT }, // ADR-018 §9
      transformRequest,
    });
    mapRef.current = map;

    const updateZoomRequired = () => setZoomRequired(map.getZoom() < MAP_MIN_ZOOM_FOR_TRAILS);

    // Question ouverte n°2, 1ᵉʳ levier (le plus important) : `moveend`/`zoomend` DÉBOUNCÉS, jamais
    // pendant le geste. En L1, ils ne pilotent que l'état dérivé `zoom_required` — en L2, le même
    // point d'accroche déclenchera le fetch de tracés (`GET /api/v1/map/trails`).
    const debouncedUpdateZoomRequired = debounce(updateZoomRequired, MAP_VIEWPORT_DEBOUNCE_MS);

    map.on("load", () => {
      setLoadState("ready");
      updateZoomRequired();
    });
    map.on("moveend", debouncedUpdateZoomRequired);
    map.on("zoomend", debouncedUpdateZoomRequired);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // `styleUrl` ne change jamais après le montage initial dans ce lot (une seule variable
    // d'environnement, pas de bascule de style en cours de session) : dépendance figée volontaire.
  }, [styleUrl]);

  const recenter = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unavailable");
      return;
    }

    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState("idle");
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(map.getZoom(), MAP_MIN_ZOOM_FOR_TRAILS),
        });
      },
      (error) => {
        // `permission refusée = état explicite affiché, jamais un écran vide` (ADR-018, lot L1).
        setGeoState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="relative h-full w-full" data-testid="map-canvas">
      <div ref={containerRef} className="absolute inset-0" data-testid="map-container" />

      {loadState === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background" data-testid="map-loading">
          <p className="text-label text-foreground-muted">CHARGEMENT DE LA CARTE…</p>
        </div>
      ) : null}

      {loadState === "ready" && zoomRequired ? (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-5" data-testid="map-zoom-required">
          <p className="rounded-full bg-surface-raised px-4 py-2 text-center text-small text-foreground-muted shadow-lg">
            Zoom avant pour explorer les tracés
          </p>
        </div>
      ) : null}

      {tileCapReached ? (
        <div className="absolute inset-x-0 top-4 z-10 flex justify-center px-5" data-testid="map-tile-cap-reached">
          <p className="rounded-full bg-surface-raised px-4 py-2 text-center text-small text-warning shadow-lg">
            Exploration limitée — recharge la page pour continuer à explorer
          </p>
        </div>
      ) : null}

      {geoState === "denied" || geoState === "unavailable" ? (
        <div className="absolute inset-x-4 bottom-24 z-10 rounded-lg bg-surface-raised p-4 shadow-lg" data-testid="map-geolocation-error" role="status">
          <p className="text-body text-foreground-muted">
            {geoState === "denied"
              ? "Localisation refusée — autorise la géolocalisation dans les réglages de ton navigateur pour te recentrer automatiquement."
              : "Localisation indisponible sur cet appareil."}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={recenter}
        disabled={geoState === "locating"}
        aria-label="Recentrer sur ma position"
        data-testid="map-recenter-button"
        className="absolute bottom-24 right-4 z-10 flex size-11 items-center justify-center rounded-full bg-surface text-foreground shadow-lg disabled:opacity-60"
      >
        <LocateFixed aria-hidden="true" size={20} />
      </button>
    </div>
  );
}
