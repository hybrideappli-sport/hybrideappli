"use client";

import { useEffect, useRef } from "react";
import type { FilterSpecification, GeoJSONSource, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";

import {
  buildRouteLabelsLayer,
  buildTrailLineLayers,
  findFirstSymbolLayerId,
  selectedLineDynamicStyle,
  TRAILS_LAYER_IDS,
  TRAILS_SOURCE_ID,
} from "./map-layers";
import { resolveRouteLabelFontStack } from "./route-label-font";
import type { TrailRenderFeatureCollection } from "./trail-render-source";

const EMPTY_COLLECTION: TrailRenderFeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Intègre la source et les 8 couches de tracés dans une instance MapLibre déjà chargée — ADR-018,
 * lot L3 ; `docs/design-carte.md` §5.2, §5.5, §5.7, §9.2.
 *
 * La `FeatureCollection` (dédoublonnée, `renderSport`/`isNamedRoute` calculés) est un INPUT de ce
 * hook, pas un état interne : elle est calculée UNE FOIS par rendu dans `<MapCanvas>`
 * (`buildTrailRenderFeatureCollection`, mémoïsée) et partagée avec `useTrailSelection` — évite
 * toute course entre deux `ref` recalculées séparément par deux hooks distincts.
 *
 * Les types de couche/expression MapLibre ne sont convertis qu'ICI (`as unknown as
 * LayerSpecification`) — `map-layers.ts` reste framework-agnostic et testable sans WebGL (voir sa
 * note de tête de fichier).
 */
export function useTrailsLayer(
  map: MapLibreMap | null,
  mapReady: boolean,
  options: {
    collection: TrailRenderFeatureCollection;
    selectedId: string | null;
  },
): void {
  const setupDoneRef = useRef(false);

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

  // `setData()` à chaque changement de collection — AUCUNE requête réseau ici (§3.1).
  useEffect(() => {
    if (!map || !setupDoneRef.current) return;
    const source = map.getSource(TRAILS_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(options.collection as unknown as Parameters<GeoJSONSource["setData"]>[0]);
  }, [map, options.collection]);

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
      ? options.collection.features.find((feature) => feature.properties.osmId === options.selectedId)
      : undefined;
    const dynamicStyle = selectedLineDynamicStyle(selectedFeature?.properties.renderSport ?? null);
    map.setLayoutProperty(TRAILS_LAYER_IDS.selectedLine, "line-cap", dynamicStyle.lineCap);
    map.setPaintProperty(TRAILS_LAYER_IDS.selectedLine, "line-dasharray", dynamicStyle.lineDasharray);
  }, [map, options.selectedId, options.collection]);
}
