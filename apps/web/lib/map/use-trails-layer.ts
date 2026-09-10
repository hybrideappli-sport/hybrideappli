"use client";

import { useEffect, useRef } from "react";
import type { FilterSpecification, GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";

import type { MapSport, MapTrailFeature } from "@hybride/domain";

import {
  buildRouteLabelsLayer,
  buildTrailLineLayers,
  findFirstSymbolLayerId,
  selectedLineDynamicStyle,
  TRAILS_LAYER_IDS,
  TRAILS_SOURCE_ID,
} from "./map-layers";
import { resolveRouteLabelFontStack } from "./route-label-font";
import { buildTrailRenderFeatureCollection, type TrailRenderFeatureCollection } from "./trail-render-source";

const EMPTY_COLLECTION: TrailRenderFeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Intègre la source et les 8 couches de tracés dans une instance MapLibre déjà chargée — ADR-018,
 * lot L3 ; `docs/design-carte.md` §5.2, §5.5, §5.7, §9.2.
 *
 * Les types de couche/expression MapLibre ne sont convertis qu'ICI (`as unknown as
 * LayerSpecification`) — `map-layers.ts` reste framework-agnostic et testable sans WebGL (voir sa
 * note de tête de fichier).
 */
export function useTrailsLayer(
  map: MapLibreMap | null,
  mapReady: boolean,
  options: {
    trails: readonly MapTrailFeature[];
    activeFilters: ReadonlySet<MapSport>;
    selectedId: string | null;
  },
): { getRenderedCollection: () => TrailRenderFeatureCollection } {
  const setupDoneRef = useRef(false);
  const collectionRef = useRef<TrailRenderFeatureCollection>(EMPTY_COLLECTION);

  // Mise en place UNE SEULE FOIS : source vide + 8 couches (§9.2). `beforeId` = 1ʳᵉ couche `symbol`
  // du style CHARGÉ (§5.2 point 3), sauf la couche 8 (étiquettes), ajoutée en dernier (§5.7.4).
  useEffect(() => {
    if (!map || !mapReady || setupDoneRef.current || map.getSource(TRAILS_SOURCE_ID)) return;

    // `data` attend un `GeoJSON.FeatureCollection` (type non ré-exporté par le paquet `maplibre-gl`
    // public, voir la note de tête de `map-layers.ts`) : converti via `Parameters<…>` plutôt que
    // d'importer le type interne du style-spec (dépendance fantôme sous pnpm).
    map.addSource(TRAILS_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
    } as unknown as Parameters<MapLibreMap["addSource"]>[1]);

    const style = map.getStyle();
    const beforeId = findFirstSymbolLayerId(style);
    for (const layer of buildTrailLineLayers({ selectedId: null })) {
      map.addLayer(layer as unknown as LayerSpecification, beforeId);
    }
    const fontStack = resolveRouteLabelFontStack(style);
    map.addLayer(buildRouteLabelsLayer(fontStack) as unknown as LayerSpecification);

    setupDoneRef.current = true;
  }, [map, mapReady]);

  // Recalcul + `setData()` à chaque changement de tracés bruts OU de filtres actifs — AUCUNE
  // requête réseau ici, uniquement une recomputation locale (§3.1).
  useEffect(() => {
    if (!map || !setupDoneRef.current) return;
    const collection = buildTrailRenderFeatureCollection(options.trails, options.activeFilters);
    collectionRef.current = collection;
    const source = map.getSource(TRAILS_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(collection as unknown as Parameters<GeoJSONSource["setData"]>[0]);
  }, [map, options.trails, options.activeFilters]);

  // Filtres des 7 couches de trait dépendants de `selectedId` (§5.5 : le tracé sélectionné est
  // retiré des couches de base). `setFilter`, jamais un retrait/ré-ajout — évite tout scintillement.
  useEffect(() => {
    if (!map || !setupDoneRef.current) return;
    for (const layer of buildTrailLineLayers({ selectedId: options.selectedId })) {
      map.setFilter(layer.id, layer.filter as unknown as FilterSpecification);
    }

    // §9.2 : `line-dasharray` n'est pas data-driven — le motif/`line-cap` de la couche « ligne
    // sélectionnée » (unique, quel que soit le sport) est ajusté IMPÉRATIVEMENT ici.
    const selectedFeature = options.selectedId
      ? collectionRef.current.features.find((feature) => feature.properties.osmId === options.selectedId)
      : undefined;
    const dynamicStyle = selectedLineDynamicStyle(selectedFeature?.properties.renderSport ?? null);
    map.setLayoutProperty(TRAILS_LAYER_IDS.selectedLine, "line-cap", dynamicStyle.lineCap);
    map.setPaintProperty(TRAILS_LAYER_IDS.selectedLine, "line-dasharray", dynamicStyle.lineDasharray);
  }, [map, options.selectedId]);

  return { getRenderedCollection: () => collectionRef.current };
}
