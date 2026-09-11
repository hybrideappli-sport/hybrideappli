import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MAP_CASING_COLOR, MAP_COLORS, MAP_SELECTED_CASING_COLOR, WIDTH_BASE_STOPS, WIDTH_ROUTE_MULTIPLIER, WIDTH_SELECTED_MULTIPLIER } from "./map-tokens";

/**
 * `docs/design-carte.md` §9.1 : « si `developer` préfère garder les variables CSS actives, ajouter
 * un test unitaire qui assert l'égalité entre le module TS et les valeurs CSS. » — c'est ce test.
 * Il lit `globals.css` comme un fichier texte (pas de parseur CSS : les quatre lignes visées sont
 * des déclarations `--map-*: #……;` simples, un grep suffit et reste lisible en échec).
 */
function readGlobalsCssVariable(name: string): string {
  const cssPath = path.resolve(__dirname, "../../app/globals.css");
  const css = readFileSync(cssPath, "utf-8");
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
  if (!match) throw new Error(`Variable CSS --${name} introuvable dans ${cssPath}`);
  return match[1].toLowerCase();
}

describe("map-tokens — égalité avec les variables CSS de globals.css (design-carte.md §9.1)", () => {
  it.each([
    ["map-route", MAP_COLORS.route],
    ["map-trail", MAP_COLORS.trail],
    ["map-hike", MAP_COLORS.hike],
    ["map-bike", MAP_COLORS.bike],
    ["map-casing", MAP_CASING_COLOR],
    ["map-selected-casing", MAP_SELECTED_CASING_COLOR],
  ])("--%s == %s", (cssVarName, expected) => {
    expect(readGlobalsCssVariable(cssVarName)).toBe(expected);
  });
});

describe("map-tokens — invariant des quatre significations d'épaisseur (design-carte.md §5.5 point 1, §9.1)", () => {
  it("segment < segment sélectionné < itinéraire < itinéraire sélectionné, à tout palier de zoom", () => {
    for (const [, base] of WIDTH_BASE_STOPS) {
      const segment = base;
      const segmentSelected = base * WIDTH_SELECTED_MULTIPLIER;
      const route = base * WIDTH_ROUTE_MULTIPLIER;
      const routeSelected = base * WIDTH_ROUTE_MULTIPLIER * WIDTH_SELECTED_MULTIPLIER;

      expect(segment).toBeLessThan(segmentSelected);
      expect(segmentSelected).toBeLessThan(route);
      expect(route).toBeLessThan(routeSelected);
    }
  });

  it("valeurs exactes au zoom 12 (design-carte.md §5.5 point 1 : 2 < 2,7 < 3 < 4,05)", () => {
    const [, base] = WIDTH_BASE_STOPS[0];
    expect(base).toBe(2);
    expect(base * WIDTH_SELECTED_MULTIPLIER).toBeCloseTo(2.7);
    expect(base * WIDTH_ROUTE_MULTIPLIER).toBe(3);
    expect(base * WIDTH_ROUTE_MULTIPLIER * WIDTH_SELECTED_MULTIPLIER).toBeCloseTo(4.05);
  });
});
