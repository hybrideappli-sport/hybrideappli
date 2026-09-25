"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { LocateFixed } from "lucide-react";

import "maplibre-gl/dist/maplibre-gl.css";
// APRÈS la feuille de MapLibre, jamais avant : elle en corrige la lisibilité de l'attribution
// (obligation ODbL, ADR-018 §9). Voir l'en-tête du fichier.
import "./map-canvas.css";

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
import { useActiveFilters } from "@/lib/map/use-active-filters";
import { useTrailsFetch } from "@/lib/map/use-trails-fetch";
import { useTrailsLayer } from "@/lib/map/use-trails-layer";
import { useTrailSelection } from "@/lib/map/use-trail-selection";
import { buildTrailRenderFeatureCollection } from "@/lib/map/trail-render-source";
import { buildCountAnnouncement, deriveEmptyState } from "@/lib/map/map-screen-state";
import { buildSelectionAnnouncement } from "@/lib/map/trail-selection-format";

import { FilterPills } from "./filter-pills";
import { SelectionSheet } from "./selection-sheet";
import { ViewfinderHint, ViewfinderOverlay } from "./viewfinder-overlay";
import { DegradedBanner, EmptyStateCard, ErrorStateCard, OfflineStateCard, TruncatedBanner, ZoomRequiredCard } from "./map-states";

/**
 * `<MapCanvas>` — ADR-018, lots L1 (socle, attribution, recentrage, garde de zoom/tuiles/géoloc) ET
 * L3 (rendu des tracés, filtres, sélection, fiche, états d'écran, accessibilité). Composant CLIENT
 * réel (chargé via `next/dynamic`, `ssr: false`, voir `map-canvas-dynamic.tsx`).
 *
 * Périmètre explicitement REPORTÉ à une phase 2 (design-carte.md §11 point 3, et confirmé pour ce
 * lot) : le panneau « Itinéraires balisés » (§5.6, confort de DÉCOUVRABILITÉ, pas l'exigence
 * d'accessibilité de l'ADR — c'est le viseur qui l'est). Rien dans ce composant n'en dépend :
 * les itinéraires nommés restent mis en avant sur la carte (trait ×1,5, nom le long du tracé,
 * badge « ITINÉRAIRE » de la fiche, décompte `aria-live`) — seule la LISTE dédiée est absente.
 */

type LoadState = "loading" | "ready";
type GeoState = "idle" | "locating" | "denied" | "unavailable";

export interface MapCanvasProps {
  /** URL de style déjà résolue côté serveur (clé publique incluse le cas échéant, `tiles-config.ts`). */
  styleUrl: string;
}

function bboxOf(map: MapLibreMap): string {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
}

export function MapCanvas({ styleUrl }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // État, PAS ref : `mapInstance` est lu PENDANT le rendu (passé aux hooks `useTrailsLayer`/
  // `useTrailSelection` ci-dessous) — le jeu de règles « React Compiler » de ce dépôt interdit la
  // lecture d'une ref pendant le rendu (voir la même note dans `use-trail-selection.ts`).
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [zoomRequired, setZoomRequired] = useState(false);
  const [tileCapReached, setTileCapReached] = useState(false);
  const [geoState, setGeoState] = useState<GeoState>("idle");
  // Initialisée par un lazy-initializer (lu UNE FOIS, à la construction du state) plutôt que par un
  // `setState` dans un `useEffect` : c'est le point de synchronisation initial recommandé par React
  // pour un état dérivé d'une API du navigateur au premier rendu client.
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [liveMessage, setLiveMessage] = useState("");

  const { activeFilters, toggleFilter, showAllFilters } = useActiveFilters();
  const { state: trailsState, fetchBbox } = useTrailsFetch();

  const renderedCollection = useMemo(
    () => buildTrailRenderFeatureCollection(trailsState.trails, activeFilters),
    [trailsState.trails, activeFilters],
  );

  const { selectedId, viewfinderVisible, clearSelection } = useTrailSelection(mapInstance, loadState === "ready", renderedCollection);
  const selectedFeature = useMemo(
    () => (selectedId ? renderedCollection.features.find((feature) => feature.properties.osmId === selectedId) : undefined),
    [renderedCollection, selectedId],
  );

  useTrailsLayer(mapInstance, loadState === "ready", { collection: renderedCollection, selectedId });

  const runFetch = useCallback(
    (map: MapLibreMap) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return; // §7.9 — pas de tentative hors ligne
      if (map.getZoom() < MAP_MIN_ZOOM_FOR_TRAILS) return;
      fetchBbox(bboxOf(map));
    },
    [fetchBbox],
  );

  const retryFetch = useCallback(() => {
    if (mapInstance) runFetch(mapInstance);
  }, [mapInstance, runFetch]);

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
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: { compact: false, customAttribution: MAP_ATTRIBUTION_TEXT },
      transformRequest,
    });
    setMapInstance(map);

    const updateViewport = () => {
      const required = map.getZoom() < MAP_MIN_ZOOM_FOR_TRAILS;
      setZoomRequired(required);
      if (!required) runFetch(map);
    };

    const debouncedUpdateViewport = debounce(updateViewport, MAP_VIEWPORT_DEBOUNCE_MS);

    map.on("load", () => {
      setLoadState("ready");
      updateViewport();
    });
    map.on("moveend", debouncedUpdateViewport);
    map.on("zoomend", debouncedUpdateViewport);

    return () => {
      map.remove();
      setMapInstance(null);
      setLoadState("loading");
    };
    // `styleUrl` ne change jamais après le montage initial dans ce lot : dépendance figée volontaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  // §7.9 — hors ligne, affiché AVANT l'échec réseau. L'état initial est déjà posé par le
  // lazy-initializer de `isOnline` ci-dessus : cet effet ne fait que s'ABONNER aux transitions.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const handleOnline = () => {
      setIsOnline(true);
      if (mapInstance) runFetch(mapInstance);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [runFetch, mapInstance]);

  // §3.5/§6.5 — décompte par sport rendu (après chaque chargement/changement de filtre) et annonce
  // de sélection (la surface y est TOUJOURS reprise, cohérence stricte avec le visuel — décision du
  // fondateur du 2026-09-10, voir `trail-selection-format.ts`). Ajustement d'état PENDANT le rendu
  // (pattern React documenté, comparaison à la valeur précédente via `useState`), PAS dans un
  // `useEffect` : les deux dépendances changent à chaque tap de pastille ou de tracé, un `setState`
  // dans un effet y ajouterait systématiquement un second rendu (même raisonnement que la
  // désélection automatique de `use-trail-selection.ts`).
  const [announcedCollection, setAnnouncedCollection] = useState(renderedCollection);
  if (trailsState.status === "ok" && announcedCollection !== renderedCollection) {
    setAnnouncedCollection(renderedCollection);
    setLiveMessage(buildCountAnnouncement(renderedCollection));
  }

  const [announcedSelection, setAnnouncedSelection] = useState(selectedFeature);
  if (selectedFeature && announcedSelection !== selectedFeature) {
    setAnnouncedSelection(selectedFeature);
    setLiveMessage(
      buildSelectionAnnouncement({
        name: selectedFeature.properties.name,
        isNamedRoute: selectedFeature.properties.isNamedRoute,
        distanceKm: selectedFeature.properties.distanceKm,
        surface: selectedFeature.properties.surface,
        surfaceInferred: selectedFeature.properties.surfaceInferred,
        sports: selectedFeature.properties.sports,
      }),
    );
  }

  const recenter = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unavailable");
      return;
    }

    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState("idle");
        const map = mapInstance;
        if (!map) return;
        map.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: Math.max(map.getZoom(), MAP_MIN_ZOOM_FOR_TRAILS),
        });
      },
      (error) => {
        setGeoState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const renderedCount = renderedCollection.features.filter((feature) => feature.properties.renderSport !== undefined).length;
  const emptyState =
    loadState === "ready" && !zoomRequired && trailsState.status === "ok"
      ? deriveEmptyState({ rawTrailsCount: trailsState.trails.length, renderedCount, activeFilterCount: activeFilters.size })
      : null;

  return (
    <div className="flex h-full w-full flex-col">
      <FilterPills activeFilters={activeFilters} onToggle={toggleFilter} />

      <div className="relative flex-1" data-testid="map-canvas">
        {/*
          `h-full w-full` et NON `absolute inset-0` : au montage, MapLibre ajoute sa classe
          `maplibregl-map` sur ce conteneur, et sa feuille déclare `.maplibregl-map { position:
          relative }`. Même spécificité que le `.absolute` de Tailwind (une classe), mais elle est
          importée depuis ce module chargé dynamiquement, donc injectée APRÈS — et elle gagne. Le
          conteneur repassait alors en `position: relative`, `inset-0` cessait de le dimensionner, sa
          hauteur retombait à `auto` (tous ses enfants sont positionnés) donc à 0, et MapLibre
          retombait sur son repli `_containerDimensions()` de 300 px de haut, masqué par son propre
          `overflow: hidden`. Symptôme : un écran noir, sans interaction et sans la moindre erreur.

          Dimensionner en pourcentage rend la taille INDÉPENDANTE de `position`, donc immunisée à cet
          écrasement. Ne pas revenir à un positionnement par `inset` ici.
        */}
        <div ref={containerRef} className="h-full w-full" data-testid="map-container" />

        {loadState === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background" data-testid="map-loading">
            <p className="text-label text-foreground-muted">CHARGEMENT DE LA CARTE…</p>
          </div>
        ) : null}

        {loadState === "ready" && !isOnline ? <OfflineStateCard /> : null}

        {loadState === "ready" && isOnline && zoomRequired ? <ZoomRequiredCard /> : null}

        {loadState === "ready" && isOnline && !zoomRequired && trailsState.status === "loading" ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-5" data-testid="map-trails-loading">
            <p className="rounded-full bg-surface-raised px-4 py-2 text-center text-small text-foreground-muted shadow-lg" aria-live="polite">
              Recherche des tracés…
            </p>
          </div>
        ) : null}

        {loadState === "ready" && isOnline && !zoomRequired && trailsState.status === "error" ? <ErrorStateCard onRetry={retryFetch} /> : null}

        {emptyState ? <EmptyStateCard kind={emptyState} maskedCount={trailsState.trails.length} onShowAll={showAllFilters} /> : null}

        {trailsState.status === "ok" && trailsState.degraded ? <DegradedBanner onRetry={retryFetch} /> : null}
        {trailsState.status === "ok" && trailsState.truncated ? <TruncatedBanner /> : null}

        {viewfinderVisible ? (
          <>
            <ViewfinderHint />
            <ViewfinderOverlay />
          </>
        ) : null}

        {tileCapReached ? (
          <div className="absolute inset-x-0 top-4 z-10 flex justify-center px-5" data-testid="map-tile-cap-reached">
            <p className="rounded-full bg-surface-raised px-4 py-2 text-center text-small text-warning shadow-lg">
              Exploration limitée — recharge la page pour continuer à explorer
            </p>
          </div>
        ) : null}

        {geoState === "denied" || geoState === "unavailable" ? (
          <div
            className="absolute inset-x-4 z-10 rounded-lg bg-surface-raised p-4 shadow-lg"
            style={{ bottom: selectedFeature ? 160 : 96 }}
            data-testid="map-geolocation-error"
            role="status"
          >
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
          className="absolute right-4 z-10 flex size-12 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.6)] disabled:opacity-60"
          style={{ bottom: selectedFeature ? 160 : 24 }}
        >
          <LocateFixed aria-hidden="true" size={20} />
        </button>

        {selectedFeature ? <SelectionSheet feature={selectedFeature} activeFilters={activeFilters} onClose={clearSelection} /> : null}

        {/* Région `aria-live` unique pour le décompte (§3.5) et l'annonce de sélection (§6.5) —
            jamais `assertive` (charte §5). Visuellement masquée : son contenu est redondant avec ce
            que l'écran affiche déjà (décompte implicite dans le rendu, fiche visible). */}
        <div className="sr-only" role="status" aria-live="polite" data-testid="map-live-region">
          {liveMessage}
        </div>
      </div>
    </div>
  );
}
