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
 * Régression : `map.addLayer()` LÈVE côté navigateur — et l'exception remonte dans l'effet React,
 * ce qui déstabilise tout le cycle de vie de la carte — dès qu'une propriété `paint`/`layout`
 * enfreint l'une des DEUX règles du style spec MapLibre sur `["zoom"]`. Aucun autre test de ce
 * fichier ne peut le voir : aucun n'instancie une vraie `Map`.
 *
 * Les deux règles, et les deux formes fautives qui se sont réellement glissées ici :
 *
 *  1. « a "zoom" expression may only be used as input to a top-level "step" or "interpolate"
 *     expression » — interdit `["*", ["interpolate", ["linear"], ["zoom"], …], …]` ;
 *  2. « Only one zoom-based "step" or "interpolate" subexpression may be used in an expression »
 *     — interdit `["case", cond, ["interpolate", …zoom…], ["interpolate", …zoom…]]`.
 *
 * La première correction a remplacé la forme 1 par la forme 2, donc un bug par un autre, parce que
 * le validateur de test n'encodait que la règle 1. Les deux sont vérifiées ci-dessous.
 *
 * Forme canonique et seule acceptée ici : UN `interpolate`/`step` sur `["zoom"]` qui EST la valeur
 * entière de la propriété, le data-driven vivant dans les SORTIES de palier.
 */
function isZoomStopExpression(node: unknown): boolean {
  if (!Array.isArray(node) || typeof node[0] !== "string") return false;
  if (node[0] === "interpolate") return Array.isArray(node[2]) && node[2][0] === "zoom";
  if (node[0] === "step") return Array.isArray(node[1]) && node[1][0] === "zoom";
  return false;
}

function countZoomStopExpressions(node: unknown): number {
  if (!Array.isArray(node)) return 0;
  const here = isZoomStopExpression(node) ? 1 : 0;
  return here + node.reduce<number>((total, child) => total + countZoomStopExpressions(child), 0);
}

/** Règles 1 et 2 réunies : au plus UNE expression de zoom, et si elle existe elle est la valeur
 * entière de la propriété — jamais imbriquée, `case`/`match` compris. */
function assertZoomExpressionIsWellFormed(value: unknown, path: string): void {
  const total = countZoomStopExpressions(value);
  if (total === 0) return;
  if (total > 1) {
    throw new Error(`${path} : ${total} sous-expressions de zoom, le style spec MapLibre n'en autorise qu'UNE (règle 2) — ${JSON.stringify(value)}`);
  }
  if (!isZoomStopExpression(value)) {
    throw new Error(`${path} : l'expression de zoom est imbriquée au lieu d'être la valeur entière de la propriété (règle 1) — ${JSON.stringify(value)}`);
  }
}

describe("Expressions de zoom bien formées dans paint/layout (régression style spec MapLibre)", () => {
  it("buildTrailLineLayers — toutes les couches (sélection nulle ou active)", () => {
    for (const selectedId of [null, "way/42"]) {
      for (const layer of buildTrailLineLayers({ selectedId })) {
        for (const [prop, value] of Object.entries({ ...layer.paint, ...layer.layout })) {
          assertZoomExpressionIsWellFormed(value, `${layer.id}.${prop}`);
        }
      }
    }
  });

  it("buildRouteLabelsLayer — layout et paint", () => {
    const layer = buildRouteLabelsLayer(["Stadia Semibold"]);
    for (const [prop, value] of Object.entries({ ...layer.paint, ...layer.layout })) {
      assertZoomExpressionIsWellFormed(value, `${layer.id}.${prop}`);
    }
  });

  it("rejette les deux formes fautives réellement rencontrées", () => {
    const stops = [12, 1, 16, 2];
    const interpolate = ["interpolate", ["linear"], ["zoom"], ...stops];
    // Forme 1 — zoom imbriqué dans un opérateur arithmétique.
    expect(() => assertZoomExpressionIsWellFormed(["*", interpolate, 1.5], "test.forme1")).toThrow(/règle 1/);
    // Forme 2 — deux expressions de zoom dans un `case`.
    expect(() => assertZoomExpressionIsWellFormed(["case", ["==", ["get", "x"], true], interpolate, interpolate], "test.forme2")).toThrow(/règle 2/);
  });
});
