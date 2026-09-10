import { describe, expect, it } from "vitest";

import { resolveRouteLabelFontStack, type StyleLike } from "./route-label-font";

/** Fixtures — jeux de glyphes réels relevés le 2026-09-10 (voir l'en-tête de `route-label-font.ts`). */
const STADIA_ALIDADE_SMOOTH_DARK_STYLE: StyleLike = {
  layers: [
    { type: "background" },
    { type: "line" },
    { type: "symbol", layout: { "text-font": ["Stadia Regular"] } },
    { type: "symbol", layout: { "text-font": ["Stadia Semibold"] } },
    { type: "symbol", layout: { "text-font": ["Stadia Bold"] } },
  ],
};

const MAPLIBRE_DEMOTILES_STYLE: StyleLike = {
  layers: [
    { type: "background" },
    { type: "line" },
    { type: "symbol", layout: { "text-font": ["Open Sans Semibold"] } },
    { type: "symbol", layout: { "text-font": ["Open Sans Semibold"] } },
  ],
};

describe("resolveRouteLabelFontStack (design-carte.md §9.3)", () => {
  it("préfère une police 'semibold' quand le style en sert une (Stadia)", () => {
    expect(resolveRouteLabelFontStack(STADIA_ALIDADE_SMOOTH_DARK_STYLE)).toEqual(["Stadia Semibold"]);
  });

  it("préfère une police 'semibold' sur le style de démonstration (dev/E2E)", () => {
    expect(resolveRouteLabelFontStack(MAPLIBRE_DEMOTILES_STYLE)).toEqual(["Open Sans Semibold"]);
  });

  it("ne renvoie JAMAIS un nom absent des couches symbol du style chargé (jamais 'Inter', jamais une famille CSS)", () => {
    const style: StyleLike = { layers: [{ type: "symbol", layout: { "text-font": ["Roboto Bold"] } }] };
    const resolved = resolveRouteLabelFontStack(style);
    const availableNames = style.layers.flatMap((layer) => layer.layout?.["text-font"] ?? []);
    for (const font of resolved) expect(availableNames).toContain(font);
  });

  it("à défaut de police 'semibold', reprend la première police disponible du style", () => {
    const style: StyleLike = {
      layers: [
        { type: "symbol", layout: { "text-font": ["Roboto Regular"] } },
        { type: "symbol", layout: { "text-font": ["Roboto Bold"] } },
      ],
    };
    expect(resolveRouteLabelFontStack(style)).toEqual(["Roboto Regular"]);
  });

  it("style dégénéré sans aucune couche symbol : filet ultime documentaire, jamais un tableau vide", () => {
    expect(resolveRouteLabelFontStack({ layers: [{ type: "background" }, { type: "line" }] })).toEqual(["Noto Sans Regular"]);
  });

  it("ignore les couches symbol sans text-font déclaré", () => {
    const style: StyleLike = {
      layers: [
        { type: "symbol", layout: {} },
        { type: "symbol", layout: { "text-font": ["Stadia Semibold"] } },
      ],
    };
    expect(resolveRouteLabelFontStack(style)).toEqual(["Stadia Semibold"]);
  });
});
