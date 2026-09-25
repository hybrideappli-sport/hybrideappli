import { describe, expect, it } from "vitest";

import type { MapSport, MapTrailFeature } from "@hybride/domain";

import { buildTrailRenderFeatureCollection } from "./trail-render-source";
import { buildCountAnnouncement, deriveEmptyState, formatCountFr } from "./map-screen-state";

function trail(osmId: string, sports: MapSport[], overrides: Partial<MapTrailFeature["properties"]> = {}): MapTrailFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: {
      osmId,
      sports,
      name: null,
      distanceKm: 0.5,
      elevationGainM: null,
      surface: null,
      surfaceInferred: true,
      osmUrl: `https://www.openstreetmap.org/${osmId}`,
      ...overrides,
    },
  };
}

describe("formatCountFr — séparateur de milliers en espace insécable fine (§7.3)", () => {
  it("formate un nombre à quatre chiffres", () => {
    expect(formatCountFr(1240)).toBe("1 240");
  });

  it("laisse un nombre à trois chiffres ou moins inchangé", () => {
    expect(formatCountFr(592)).toBe("592");
    expect(formatCountFr(0)).toBe("0");
  });
});

describe("buildCountAnnouncement — exemple exact de §3.5", () => {
  it("« 1 240 tracés affichés : 480 Vélo, 390 Trail, 370 Rando, dont 3 itinéraires balisés. »", () => {
    const trails: MapTrailFeature[] = [
      ...Array.from({ length: 480 }, (_, i) => trail(`way/bike-${i}`, ["bike"])),
      ...Array.from({ length: 390 }, (_, i) => trail(`way/trail-${i}`, ["trail"])),
      ...Array.from({ length: 367 }, (_, i) => trail(`way/hike-${i}`, ["hike"])),
      ...Array.from({ length: 3 }, (_, i) => trail(`relation/route-${i}`, ["hike"], { name: `Itinéraire ${i}` })),
    ];
    const collection = buildTrailRenderFeatureCollection(trails, new Set(["route", "trail", "hike", "bike"]));
    expect(buildCountAnnouncement(collection)).toBe("1 240 tracés affichés : 480 Vélo, 390 Trail, 370 Rando, dont 3 itinéraires balisés.");
  });

  it("un seul itinéraire balisé : singulier", () => {
    const trails = [trail("relation/1", ["hike"], { name: "Sentier" })];
    const collection = buildTrailRenderFeatureCollection(trails, new Set(["hike"]));
    expect(buildCountAnnouncement(collection)).toBe("1 tracés affichés : 1 Rando, dont 1 itinéraire balisé.");
  });

  it("aucun sport à zéro n'apparaît dans la liste (Route absent si son compte est nul)", () => {
    const trails = [trail("way/1", ["bike"])];
    const collection = buildTrailRenderFeatureCollection(trails, new Set(["bike"]));
    expect(buildCountAnnouncement(collection)).toBe("1 tracés affichés : 1 Vélo.");
  });

  it("aucun tracé rendu ⟹ phrase dédiée", () => {
    const collection = buildTrailRenderFeatureCollection([], new Set(["hike"]));
    expect(buildCountAnnouncement(collection)).toBe("Aucun tracé affiché.");
  });
});

describe("deriveEmptyState — les trois cas distincts de §7.3, à ne jamais confondre", () => {
  it("(c) aucun filtre actif — priorité sur les deux autres cas", () => {
    expect(deriveEmptyState({ rawTrailsCount: 500, renderedCount: 0, activeFilterCount: 0 })).toBe("no-filter-active");
  });

  it("(a) zone non cartographiée : aucun tracé reçu du tout", () => {
    expect(deriveEmptyState({ rawTrailsCount: 0, renderedCount: 0, activeFilterCount: 4 })).toBe("zone-not-mapped");
  });

  it("(b) tout masqué par les filtres : des tracés existent, aucun n'est rendu, au moins un filtre actif", () => {
    expect(deriveEmptyState({ rawTrailsCount: 1240, renderedCount: 0, activeFilterCount: 1 })).toBe("filtered-out");
  });

  it("au moins un tracé rendu ⟹ pas d'état vide", () => {
    expect(deriveEmptyState({ rawTrailsCount: 1240, renderedCount: 1, activeFilterCount: 4 })).toBeNull();
  });
});
