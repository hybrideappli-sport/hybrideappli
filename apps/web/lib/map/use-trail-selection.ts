"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";

import { distancePointToPolyline, distancePointToPolylines } from "./geometry";
import { TRAILS_LAYER_IDS } from "./map-layers";
import { cycleSelectionCandidate, orderSelectionCandidates, type SelectionCandidate } from "./selection-candidates";
import type { TrailRenderFeatureCollection } from "./trail-render-source";

/** §5.4.3 — cible tactile du tap : boîte 24×24 px (WCAG 2.2 SC 2.5.8). */
const TAP_BOX_PX = 24;
/** §5.4.1 — boîte du viseur clavier : 44×44 px, plus large qu'un tap (déplacement à la flèche
 * grossier, ne permet pas de viser au pixel). */
const VIEWFINDER_BOX_PX = 44;

/** Couches interrogées par `queryRenderedFeatures` — les 4 traits par sport + la ligne
 * sélectionnée (un ré-tap sur le tracé déjà sélectionné doit continuer à le retrouver). La couche
 * de halo (`trails-casing`) n'y figure pas : elle porte la même géométrie, l'inclure doublerait
 * chaque candidat sans rien y apporter. */
const QUERYABLE_LAYER_IDS = [
  TRAILS_LAYER_IDS.route,
  TRAILS_LAYER_IDS.trail,
  TRAILS_LAYER_IDS.hike,
  TRAILS_LAYER_IDS.bike,
  TRAILS_LAYER_IDS.selectedLine,
];

function projectToPixel(map: MapLibreMap, coordinate: readonly [number, number]): [number, number] {
  const projected = map.project(coordinate as [number, number]);
  return [projected.x, projected.y];
}

// Le type `geometry` du paquet MapLibre (`GeoJSONFeature`, réexporté depuis un style-spec non
// dépendance directe) laisse ses `coordinates` en `any` — on retype localement, la forme réelle
// étant garantie par `trail-render-source.ts` (LineString | MultiLineString, jamais un Point/Polygon).
type LineGeometry = { type: "LineString"; coordinates: [number, number][] } | { type: "MultiLineString"; coordinates: [number, number][][] };

function distanceToGeometryPx(map: MapLibreMap, point: [number, number], rawGeometry: MapGeoJSONFeature["geometry"]): number {
  const geometry = rawGeometry as unknown as LineGeometry;
  if (geometry.type === "LineString") {
    return distancePointToPolyline(point, geometry.coordinates.map((c) => projectToPixel(map, c)));
  }
  if (geometry.type === "MultiLineString") {
    return distancePointToPolylines(point, geometry.coordinates.map((line) => line.map((c) => projectToPixel(map, c))));
  }
  return Infinity;
}

function queryCandidatesAt(map: MapLibreMap, point: [number, number], boxSizePx: number): SelectionCandidate[] {
  const half = boxSizePx / 2;
  const features = map.queryRenderedFeatures(
    [
      [point[0] - half, point[1] - half],
      [point[0] + half, point[1] + half],
    ],
    { layers: QUERYABLE_LAYER_IDS },
  );

  const seen = new Set<string>();
  const candidates: SelectionCandidate[] = [];
  for (const feature of features) {
    const osmId = feature.properties?.osmId as string | undefined;
    if (!osmId || seen.has(osmId)) continue;
    seen.add(osmId);
    candidates.push({
      osmId,
      isNamedRoute: Boolean(feature.properties?.isNamedRoute),
      distancePx: distanceToGeometryPx(map, point, feature.geometry),
    });
  }
  return candidates;
}

function canvasCenterPoint(map: MapLibreMap): [number, number] {
  const canvas = map.getCanvas();
  return [canvas.clientWidth / 2, canvas.clientHeight / 2];
}

/**
 * Sélection au tap ET au viseur clavier — ADR-018, lot L3 ; `docs/design-carte.md` §5.4 (viseur,
 * OBLIGATOIRE : l'alternative d'accessibilité exigée par ADR-018 L3), §5.4.3 (tap), §5.5
 * (désélection).
 */
export function useTrailSelection(
  map: MapLibreMap | null,
  mapReady: boolean,
  renderedCollection: TrailRenderFeatureCollection,
): {
  selectedId: string | null;
  viewfinderVisible: boolean;
  clearSelection: () => void;
} {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewfinderVisible, setViewfinderVisible] = useState(false);
  const selectedIdRef = useRef(selectedId);

  // Ajustement d'état pendant le rendu (pattern documenté par React pour « adjusting state when a
  // prop changes »), PAS dans un `useEffect` : `renderedCollection` change à chaque tap de pastille
  // (§3.1, aucune requête réseau) — un `setState` dans un effet y ajouterait un second rendu à
  // chaque changement. §4.3 : un changement de filtre qui fait perdre au tracé sélectionné son
  // `renderSport` le désélectionne (« une fiche ouverte sur un tracé devenu invisible est un état
  // incohérent »).
  // `useState`, pas `useRef` : le linter de ce dépôt (règles « React Compiler ») interdit toute
  // lecture/écriture de ref PENDANT le rendu, y compris pour ce pattern. `useState` reste le
  // mécanisme documenté par React pour détecter un changement de prop pendant le rendu.
  const [previousCollection, setPreviousCollection] = useState(renderedCollection);
  if (previousCollection !== renderedCollection) {
    setPreviousCollection(renderedCollection);
    if (selectedId !== null) {
      const stillRendered = renderedCollection.features.some(
        (feature) => feature.properties.osmId === selectedId && feature.properties.renderSport !== undefined,
      );
      if (!stillRendered) setSelectedId(null);
    }
  }

  // Synchronisé APRÈS le rendu (jamais pendant) : lu par les gestionnaires d'événements DOM
  // ci-dessous, qui vivent hors du cycle de rendu React et n'ont pas accès à `selectedId` à jour
  // autrement (l'effet d'abonnement, plus bas, ne s'exécute qu'une fois par montage de `map`).
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (!map || !mapReady) return;

    const canvasContainer = map.getCanvasContainer();
    // §5.4.1/§5.4.2 — canevas focusable, annoncé, instructions complètes dans le libellé (la seule
    // aide qui survive à un lecteur d'écran sans dépendre d'un élément visuel séparé).
    canvasContainer.setAttribute("role", "application");
    canvasContainer.setAttribute(
      "aria-label",
      "Carte des tracés outdoor. Flèches pour se déplacer, plus et moins pour zoomer, Entrée pour " +
        "sélectionner le tracé au centre, N et P pour passer au tracé suivant ou précédent, Échap pour désélectionner.",
    );

    const handleClick = (event: MapMouseEvent) => {
      const point: [number, number] = [event.point.x, event.point.y];
      const ordered = orderSelectionCandidates(queryCandidatesAt(map, point, TAP_BOX_PX));
      // §5.5 — tap sur le fond hors de tout tracé ⟹ liste vide ⟹ désélection.
      setSelectedId(ordered[0]?.osmId ?? null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const ordered = orderSelectionCandidates(queryCandidatesAt(map, canvasCenterPoint(map), VIEWFINDER_BOX_PX));
        setSelectedId(ordered[0]?.osmId ?? null);
      } else if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        const ordered = orderSelectionCandidates(queryCandidatesAt(map, canvasCenterPoint(map), VIEWFINDER_BOX_PX));
        setSelectedId(cycleSelectionCandidate(ordered, selectedIdRef.current, 1)?.osmId ?? null);
      } else if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        const ordered = orderSelectionCandidates(queryCandidatesAt(map, canvasCenterPoint(map), VIEWFINDER_BOX_PX));
        setSelectedId(cycleSelectionCandidate(ordered, selectedIdRef.current, -1)?.osmId ?? null);
      } else if (event.key === "Escape") {
        // « Un second Échap ne quitte pas le canevas » (§5.4.1) : on ne fait rien d'autre que
        // désélectionner, le focus n'est jamais déplacé ici.
        setSelectedId(null);
      }
    };

    // §5.4.1 — le viseur n'apparaît QUE lorsque le canevas a le focus CLAVIER (`:focus-visible`),
    // jamais en usage tactile.
    const handleFocus = () => setViewfinderVisible(canvasContainer.matches(":focus-visible"));
    const handleBlur = () => setViewfinderVisible(false);

    map.on("click", handleClick);
    canvasContainer.addEventListener("keydown", handleKeyDown);
    canvasContainer.addEventListener("focus", handleFocus);
    canvasContainer.addEventListener("blur", handleBlur);

    return () => {
      map.off("click", handleClick);
      canvasContainer.removeEventListener("keydown", handleKeyDown);
      canvasContainer.removeEventListener("focus", handleFocus);
      canvasContainer.removeEventListener("blur", handleBlur);
    };
  }, [map, mapReady]);

  return { selectedId, viewfinderVisible, clearSelection };
}
