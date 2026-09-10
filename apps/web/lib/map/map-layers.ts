/**
 * Empilement des 8 couches MapLibre des tracés — ADR-018, lot L3 ; `docs/design-carte.md` §5.2,
 * §5.5, §5.7.4 et surtout §9.2 (table exacte des 8 couches, contrainte « `line-dasharray` n'est pas
 * *data-driven* »).
 *
 * Fonctions PURES qui produisent des SPÉCIFICATIONS de couche (objets), jamais d'appel à une
 * instance `Map` — c'est le module consommateur (`use-trails-layer.ts`) qui appelle
 * `map.addLayer(spec, beforeId)` / `map.setPaintProperty()`. Ce choix rend l'empilement et les
 * filtres testables SANS WebGL (voir `map-layers.test.ts`, notamment la partition des filtres des
 * couches 2 à 5 exigée par §9.2 dernier paragraphe).
 *
 * Les types de couche/expression MapLibre (`LayerSpecification`, `ExpressionSpecification`…) ne
 * sont pas ré-exportés par le paquet `maplibre-gl` lui-même (seul `@maplibre/maplibre-gl-style-spec`
 * les porte, et ce n'est pas une dépendance directe de `apps/web` — un import direct serait une
 * dépendance fantôme sous pnpm). Ce module utilise donc des types structurels minimaux
 * (`TrailLineLayerSpec`/`TrailSymbolLayerSpec`) ; l'appelant fait la conversion vers
 * `LayerSpecification` au seul point où `maplibre-gl` est importé.
 */
import { MAP_SPORTS, type MapSport } from "@hybride/domain";

import { MAP_MIN_ZOOM_FOR_TRAILS } from "./constants";
import {
  CASING_EXTRA_WIDTH,
  MAP_CASING_COLOR,
  MAP_COLORS,
  MAP_LINE_CAP,
  MAP_LINE_DASH_ARRAY,
  MAP_SELECTED_CASING_COLOR,
  SELECTED_CASING_EXTRA_WIDTH,
  WIDTH_BASE_STOPS,
  WIDTH_ROUTE_MULTIPLIER,
  WIDTH_SELECTED_MULTIPLIER,
} from "./map-tokens";

export const TRAILS_SOURCE_ID = "trails";

/** §5.2 point 3 — les couches de TRAIT s'insèrent sous la 1ʳᵉ couche `symbol` du style (les
 * toponymes du fond restent au-dessus). `undefined` si le style n'en a vraiment aucune (cas
 * dégénéré, défensif : aucun basemap réel connu n'est dans ce cas) — l'appelant ajoute alors les
 * couches au sommet de la pile plutôt que d'échouer. */
export function findFirstSymbolLayerId(style: { layers: ReadonlyArray<{ id: string; type: string }> }): string | undefined {
  return style.layers.find((layer) => layer.type === "symbol")?.id;
}

export const TRAILS_LAYER_IDS = {
  casing: "trails-casing",
  hike: "trails-line-hike",
  route: "trails-line-route",
  trail: "trails-line-trail",
  bike: "trails-line-bike",
  selectedCasing: "trails-selected-casing",
  selectedLine: "trails-selected-line",
  routeLabels: "trails-route-labels",
} as const;

/** Aucune sélection : sentinelle qui ne peut jamais égaler un `osmId` réel (`'way/…' | 'relation/…'`). */
const NO_SELECTION_SENTINEL = "__none__";

// Types structurels minimaux — voir note de tête de fichier.
export interface TrailLineLayerSpec {
  id: string;
  type: "line";
  source: string;
  minzoom?: number;
  filter: unknown[];
  layout: Record<string, unknown>;
  paint: Record<string, unknown>;
}

export interface TrailSymbolLayerSpec {
  id: string;
  type: "symbol";
  source: string;
  minzoom?: number;
  filter: unknown[];
  layout: Record<string, unknown>;
  paint: Record<string, unknown>;
}

function selectedFilter(selectedId: string | null): unknown[] {
  return ["==", ["get", "osmId"], selectedId ?? NO_SELECTION_SENTINEL];
}

function notSelectedFilter(selectedId: string | null): unknown[] {
  return ["!=", ["get", "osmId"], selectedId ?? NO_SELECTION_SENTINEL];
}

/** §5.2 — épaisseur de base, itinéraire nommé multiplié par `WIDTH_ROUTE_MULTIPLIER` (§5.7.1). */
function baseWidthExpression(): unknown[] {
  const zoomStops = WIDTH_BASE_STOPS.flatMap(([zoom, width]) => [zoom, width]);
  return [
    "*",
    ["interpolate", ["linear"], ["zoom"], ...zoomStops],
    ["case", ["==", ["get", "isNamedRoute"], true], WIDTH_ROUTE_MULTIPLIER, 1],
  ];
}

/** §9.2 — teinte data-driven (`line-color` l'accepte, contrairement à `line-dasharray`) : utilisée
 * pour la couche 7 (sélection), dont le sport rendu peut être n'importe lequel des quatre. */
function renderSportColorMatchExpression(): unknown[] {
  const cases = MAP_SPORTS.flatMap((sport: MapSport) => [sport, MAP_COLORS[sport]]);
  return ["match", ["get", "renderSport"], ...cases, MAP_CASING_COLOR];
}

/** Couches 1 à 5 — halo (toujours plein, §5.2 point 1) puis un trait STATIQUE par sport (§9.2 : le
 * motif n'est pas data-driven, d'où quatre couches plutôt qu'une). Exclut le tracé sélectionné
 * (§5.5 : « doit être retiré des couches de base », sous peine de double halo). */
export function buildTrailLineLayers(options: { selectedId: string | null }): TrailLineLayerSpec[] {
  const width = baseWidthExpression();
  const notSelected = notSelectedFilter(options.selectedId);

  const casing: TrailLineLayerSpec = {
    id: TRAILS_LAYER_IDS.casing,
    type: "line",
    source: TRAILS_SOURCE_ID,
    minzoom: MAP_MIN_ZOOM_FOR_TRAILS,
    filter: ["all", ["has", "renderSport"], notSelected],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": MAP_CASING_COLOR, "line-opacity": 0.9, "line-width": ["+", width, CASING_EXTRA_WIDTH] },
  };

  const perSport: TrailLineLayerSpec[] = MAP_SPORTS.map((sport) => {
    const dashArray = MAP_LINE_DASH_ARRAY[sport];
    return {
      id: TRAILS_LAYER_IDS[sport],
      type: "line",
      source: TRAILS_SOURCE_ID,
      minzoom: MAP_MIN_ZOOM_FOR_TRAILS,
      filter: ["all", ["==", ["get", "renderSport"], sport], notSelected],
      layout: { "line-cap": MAP_LINE_CAP[sport], "line-join": "round" },
      paint: {
        "line-color": MAP_COLORS[sport],
        "line-opacity": 1,
        "line-width": width,
        ...(dashArray ? { "line-dasharray": [...dashArray] } : {}),
      },
    };
  });

  const selected = selectedFilter(options.selectedId);
  const selectedWidth: unknown[] = ["*", width, WIDTH_SELECTED_MULTIPLIER];

  const selectedCasing: TrailLineLayerSpec = {
    id: TRAILS_LAYER_IDS.selectedCasing,
    type: "line",
    source: TRAILS_SOURCE_ID,
    minzoom: MAP_MIN_ZOOM_FOR_TRAILS,
    filter: selected,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": MAP_SELECTED_CASING_COLOR,
      "line-opacity": 0.9,
      "line-width": ["+", selectedWidth, SELECTED_CASING_EXTRA_WIDTH],
    },
  };

  // Teinte et motif « inchangés » (§5.5) : la couleur est data-driven (une seule couche suffit,
  // quel que soit le sport sélectionné) ; le motif (`line-dasharray`, non data-driven) et le
  // `line-cap` sont ajustés IMPÉRATIVEMENT par l'appelant à chaque changement de sélection — voir
  // `selectedLineDynamicStyle()` ci-dessous, consommée par `use-trails-layer.ts`.
  const selectedLine: TrailLineLayerSpec = {
    id: TRAILS_LAYER_IDS.selectedLine,
    type: "line",
    source: TRAILS_SOURCE_ID,
    minzoom: MAP_MIN_ZOOM_FOR_TRAILS,
    filter: selected,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": renderSportColorMatchExpression(), "line-opacity": 1, "line-width": selectedWidth },
  };

  return [casing, ...perSport, selectedCasing, selectedLine];
}

/** Couche 8 — étiquettes des itinéraires nommés (§5.7.4). SEULE exception à `beforeId` = 1ʳᵉ
 * couche `symbol` : ajoutée EN DERNIER par l'appelant (aucun `beforeId`), pour céder la priorité de
 * collision aux toponymes du fond (§5.7.4, « placement dans la pile »). `fontStack` est résolu à
 * l'exécution contre le style chargé — voir `route-label-font.ts` (§9.3). */
export function buildRouteLabelsLayer(fontStack: readonly string[]): TrailSymbolLayerSpec {
  return {
    id: TRAILS_LAYER_IDS.routeLabels,
    type: "symbol",
    source: TRAILS_SOURCE_ID,
    minzoom: MAP_MIN_ZOOM_FOR_TRAILS,
    filter: ["==", ["get", "isNamedRoute"], true],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": ["step", ["zoom"], 400, 14, 250],
      "text-field": ["get", "name"],
      "text-font": [...fontStack],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 11, 16, 13],
      "text-letter-spacing": 0.02,
      "text-max-angle": 38,
      "text-padding": 4,
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": renderSportColorMatchExpression(),
      "text-halo-color": MAP_CASING_COLOR,
      "text-halo-width": 1.5,
      "text-halo-blur": 0,
    },
  };
}

/**
 * §5.5 — ajustement IMPÉRATIF (hors de ce module pur) de la couche 7 à chaque changement de
 * sélection : motif et `line-cap` du sport SÉLECTIONNÉ, `line-dasharray` n'étant pas data-driven
 * (§9.2). `null` (rien de sélectionné) retombe sur le trait plein — sans effet visible, le filtre de
 * la couche ne retenant alors aucune feature.
 */
export function selectedLineDynamicStyle(renderSport: MapSport | null): { lineDasharray: number[] | undefined; lineCap: "round" | "butt" } {
  if (!renderSport) return { lineDasharray: undefined, lineCap: "round" };
  const dashArray = MAP_LINE_DASH_ARRAY[renderSport];
  return { lineDasharray: dashArray ? [...dashArray] : undefined, lineCap: MAP_LINE_CAP[renderSport] };
}
