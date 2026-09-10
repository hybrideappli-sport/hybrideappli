import { describe, expect, it } from "vitest";

import { MAP_SPORTS, type MapSport } from "@hybride/domain";

import { buildRouteLabelsLayer, buildTrailLineLayers, findFirstSymbolLayerId, selectedLineDynamicStyle, TRAILS_LAYER_IDS } from "./map-layers";

/**
 * Petit évaluateur, RÉSERVÉ AUX TESTS, des seules formes d'expression produites par `map-layers.ts`
 * (`==`, `!=`, `has`, `all`) — suffisant pour vérifier par le calcul, et non seulement à l'œil, que
 * « l'intersection deux à deux [des filtres des couches 2 à 5] est vide » (design-carte.md §9.2).
 */
function evaluateFilter(filter: unknown, properties: Record<string, unknown>): boolean {
  const [op, ...rest] = filter as [string, ...unknown[]];
  switch (op) {
    case "all":
      return rest.every((sub) => evaluateFilter(sub, properties));
    case "has":
      return Object.prototype.hasOwnProperty.call(properties, rest[0] as string);
    case "==":
    case "!=": {
      const [getExpr, value] = rest as [["get", string], unknown];
      const actual = properties[getExpr[1]];
      return op === "==" ? actual === value : actual !== value;
    }
    default:
      throw new Error(`Forme d'expression non gérée par cet évaluateur de test : ${op}`);
  }
}

const SPORT_LAYER_IDS: string[] = MAP_SPORTS.map((sport) => TRAILS_LAYER_IDS[sport]);

describe("buildTrailLineLayers — empilement de 8 couches (design-carte.md §9.2)", () => {
  it("produit exactement 6 couches de trait (casing, 4 par sport, casing sélectionné, ligne sélectionnée)", () => {
    const layers = buildTrailLineLayers({ selectedId: null });
    expect(layers.map((layer) => layer.id)).toEqual([
      TRAILS_LAYER_IDS.casing,
      TRAILS_LAYER_IDS.route,
      TRAILS_LAYER_IDS.trail,
      TRAILS_LAYER_IDS.hike,
      TRAILS_LAYER_IDS.bike,
      TRAILS_LAYER_IDS.selectedCasing,
      TRAILS_LAYER_IDS.selectedLine,
    ]);
  });

  it("les filtres des 4 couches par sport sont mutuellement exclusifs (partition de renderSport)", () => {
    const layers = buildTrailLineLayers({ selectedId: null });
    const perSportLayers = layers.filter((layer) => SPORT_LAYER_IDS.includes(layer.id));
    expect(perSportLayers).toHaveLength(4);

    for (const renderSport of MAP_SPORTS) {
      const properties = { renderSport };
      const matching = perSportLayers.filter((layer) => evaluateFilter(layer.filter, properties));
      // Exactement UNE des 4 couches retient une feature d'un `renderSport` donné : c'est la
      // garantie par construction que « le chemin est dessiné une seule fois » (§9.2 dernier §).
      expect(matching).toHaveLength(1);
      expect(matching[0].id).toBe(TRAILS_LAYER_IDS[renderSport as MapSport]);
    }
  });

  it("une feature sans `renderSport` (aucun filtre actif ne la retient) n'est captée par AUCUNE couche de base", () => {
    const layers = buildTrailLineLayers({ selectedId: null });
    const baseLayers = layers.filter((layer) => layer.id !== TRAILS_LAYER_IDS.selectedCasing && layer.id !== TRAILS_LAYER_IDS.selectedLine);
    for (const layer of baseLayers) {
      expect(evaluateFilter(layer.filter, {})).toBe(false);
    }
  });

  it("le tracé sélectionné est EXCLU des couches de base (§5.5 : sans quoi double halo)", () => {
    const layers = buildTrailLineLayers({ selectedId: "way/42" });
    const casing = layers.find((layer) => layer.id === TRAILS_LAYER_IDS.casing)!;
    const hikeLine = layers.find((layer) => layer.id === TRAILS_LAYER_IDS.hike)!;
    const properties = { osmId: "way/42", renderSport: "hike" };

    expect(evaluateFilter(casing.filter, properties)).toBe(false);
    expect(evaluateFilter(hikeLine.filter, properties)).toBe(false);
  });

  it("seul le tracé sélectionné est capté par les couches 6 et 7", () => {
    const layers = buildTrailLineLayers({ selectedId: "way/42" });
    const selectedCasing = layers.find((layer) => layer.id === TRAILS_LAYER_IDS.selectedCasing)!;
    const selectedLine = layers.find((layer) => layer.id === TRAILS_LAYER_IDS.selectedLine)!;

    expect(evaluateFilter(selectedCasing.filter, { osmId: "way/42" })).toBe(true);
    expect(evaluateFilter(selectedLine.filter, { osmId: "way/42" })).toBe(true);
    expect(evaluateFilter(selectedCasing.filter, { osmId: "way/99" })).toBe(false);
  });

  it("aucune sélection : les couches 6 et 7 ne retiennent jamais rien (sentinelle, aucun osmId réel ne matche)", () => {
    const layers = buildTrailLineLayers({ selectedId: null });
    const selectedLine = layers.find((layer) => layer.id === TRAILS_LAYER_IDS.selectedLine)!;
    expect(evaluateFilter(selectedLine.filter, { osmId: "way/1" })).toBe(false);
    expect(evaluateFilter(selectedLine.filter, { osmId: "" })).toBe(false);
  });

  it("le halo (couche 1) est TOUJOURS plein : aucun `line-dasharray` dans son paint", () => {
    const [casing] = buildTrailLineLayers({ selectedId: null });
    expect(casing.paint["line-dasharray"]).toBeUndefined();
  });

  it("Route (trait continu) ne porte aucun `line-dasharray`, les 3 autres sports si", () => {
    const layers = buildTrailLineLayers({ selectedId: null });
    const byId = Object.fromEntries(layers.map((layer) => [layer.id, layer]));
    expect(byId[TRAILS_LAYER_IDS.route].paint["line-dasharray"]).toBeUndefined();
    expect(byId[TRAILS_LAYER_IDS.trail].paint["line-dasharray"]).toBeDefined();
    expect(byId[TRAILS_LAYER_IDS.hike].paint["line-dasharray"]).toBeDefined();
    expect(byId[TRAILS_LAYER_IDS.bike].paint["line-dasharray"]).toBeDefined();
  });
});

describe("buildRouteLabelsLayer (§5.7.4)", () => {
  it("filtre exactement sur isNamedRoute === true, jamais sur un segment", () => {
    const layer = buildRouteLabelsLayer(["Stadia Semibold"]);
    expect(evaluateFilter(layer.filter, { isNamedRoute: true })).toBe(true);
    expect(evaluateFilter(layer.filter, { isNamedRoute: false })).toBe(false);
    expect(evaluateFilter(layer.filter, {})).toBe(false);
  });

  it("porte le fontStack fourni tel quel (§9.3 : jamais une famille CSS codée en dur)", () => {
    const layer = buildRouteLabelsLayer(["Stadia Semibold", "Stadia Regular"]);
    expect(layer.layout["text-font"]).toEqual(["Stadia Semibold", "Stadia Regular"]);
  });

  it("text-allow-overlap et text-ignore-placement restent à false (cède la priorité aux toponymes, §5.7.4)", () => {
    const layer = buildRouteLabelsLayer(["Stadia Semibold"]);
    expect(layer.layout["text-allow-overlap"]).toBe(false);
    expect(layer.layout["text-ignore-placement"]).toBe(false);
  });
});

describe("findFirstSymbolLayerId (§5.2 point 3)", () => {
  it("renvoie l'id de la 1ʳᵉ couche symbol, jamais une couche line/fill placée avant", () => {
    const style = { layers: [{ id: "background", type: "background" }, { id: "water", type: "fill" }, { id: "place-labels", type: "symbol" }, { id: "poi-labels", type: "symbol" }] };
    expect(findFirstSymbolLayerId(style)).toBe("place-labels");
  });

  it("style sans aucune couche symbol (cas dégénéré) ⟹ undefined", () => {
    expect(findFirstSymbolLayerId({ layers: [{ id: "background", type: "background" }] })).toBeUndefined();
  });
});

describe("selectedLineDynamicStyle (§5.5, §9.2 : line-dasharray n'est pas data-driven)", () => {
  it("reprend le motif et le line-cap du sport sélectionné", () => {
    expect(selectedLineDynamicStyle("bike")).toEqual({ lineDasharray: [3, 1.5], lineCap: "butt" });
    expect(selectedLineDynamicStyle("route")).toEqual({ lineDasharray: undefined, lineCap: "round" });
  });

  it("rien de sélectionné ⟹ trait plein par défaut (sans effet visible, le filtre ne retient rien)", () => {
    expect(selectedLineDynamicStyle(null)).toEqual({ lineDasharray: undefined, lineCap: "round" });
  });
});

/**
 * Régression : `map.addLayer()` rejette en silence côté navigateur toute expression `["zoom"]`
 * (via `interpolate`/`step`) imbriquée dans un opérateur qui n'est pas `case`/`match`/`coalesce`/
 * `let` — ce n'est PAS détecté par `evaluateFilter` ci-dessus (qui n'évalue que des filtres, jamais
 * un `paint`/`layout`), ni par aucun autre test de ce fichier, puisqu'aucun n'exécute une vraie
 * instance MapLibre. C'est exactement la forme qui s'est glissée dans `widthExpression()` avant
 * correction : `["*", ["interpolate", ["linear"], ["zoom"], …], …]`.
 *
 * Ce validateur, réservé aux tests, encode la règle du style spec MapLibre : une expression de
 * zoom ne peut être que l'expression de propriété ENTIÈRE, ou un opérande direct de
 * `case`/`match`/`coalesce`/`let`.
 */
function isZoomStopExpression(node: unknown): boolean {
  if (!Array.isArray(node) || typeof node[0] !== "string") return false;
  if (node[0] === "interpolate") return Array.isArray(node[2]) && node[2][0] === "zoom";
  if (node[0] === "step") return Array.isArray(node[1]) && node[1][0] === "zoom";
  return false;
}

const EXPRESSION_CONTAINERS_ALLOWING_ZOOM = new Set(["case", "match", "coalesce", "let"]);

function assertNoIllegallyNestedZoomExpression(node: unknown, isTopLevel: boolean, path: string): void {
  if (!Array.isArray(node)) return;
  if (isZoomStopExpression(node)) {
    if (!isTopLevel) {
      throw new Error(`Expression de zoom imbriquée illégalement (hors case/match/coalesce/let/top-level) à ${path} : ${JSON.stringify(node)}`);
    }
    return;
  }
  if (typeof node[0] !== "string") {
    // Tableau littéral (ex. `line-dasharray`, `text-font`) — pas une expression de style.
    return;
  }
  const childIsTopLevel = EXPRESSION_CONTAINERS_ALLOWING_ZOOM.has(node[0]);
  node.slice(1).forEach((child, index) => assertNoIllegallyNestedZoomExpression(child, childIsTopLevel, `${path}[${index + 1}]`));
}

describe("Aucune expression de zoom imbriquée illégalement dans paint/layout (régression style spec MapLibre)", () => {
  it("buildTrailLineLayers — toutes les couches (sélection nulle ou active)", () => {
    for (const selectedId of [null, "way/42"]) {
      for (const layer of buildTrailLineLayers({ selectedId })) {
        for (const [prop, value] of Object.entries({ ...layer.paint, ...layer.layout })) {
          assertNoIllegallyNestedZoomExpression(value, true, `${layer.id}.${prop}`);
        }
      }
    }
  });

  it("buildRouteLabelsLayer — layout et paint", () => {
    const layer = buildRouteLabelsLayer(["Stadia Semibold"]);
    for (const [prop, value] of Object.entries({ ...layer.paint, ...layer.layout })) {
      assertNoIllegallyNestedZoomExpression(value, true, `${layer.id}.${prop}`);
    }
  });
});
