import { describe, expect, it } from "vitest";

import type { MapSport, MapTrailFeature } from "@hybride/domain";

import { buildTrailRenderFeatureCollection, countRenderedBySport, countRenderedNamedRoutes } from "./trail-render-source";

function trail(overrides: Partial<MapTrailFeature["properties"]> & { osmId: string; sports: MapSport[] }): MapTrailFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: {
      name: null,
      distanceKm: 0.34,
      elevationGainM: null,
      surface: null,
      surfaceInferred: true,
      osmUrl: `https://www.openstreetmap.org/${overrides.osmId}`,
      ...overrides,
    },
  };
}

const ALL_ACTIVE = new Set<MapSport>(["route", "trail", "hike", "bike"]);

describe("buildTrailRenderFeatureCollection — critère d'acceptation L3 (ADR-018)", () => {
  it("un chemin porté par deux filtres actifs est dessiné UNE SEULE FOIS", () => {
    const collection = buildTrailRenderFeatureCollection([trail({ osmId: "way/1", sports: ["trail", "hike"] })], ALL_ACTIVE);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.renderSport).toBe("trail");
  });

  it("dédoublonne par osmId (défense en profondeur, en plus du dédoublonnage L2 par tuiles)", () => {
    const duplicated: MapTrailFeature[] = [
      trail({ osmId: "way/42", sports: ["hike"], name: "Premier arrivé" }),
      trail({ osmId: "way/42", sports: ["hike"], name: "Ne doit jamais apparaître" }),
    ];
    const collection = buildTrailRenderFeatureCollection(duplicated, ALL_ACTIVE);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.name).toBe("Premier arrivé");
  });

  it("aucun filtre actif ne retient le tracé ⟹ `renderSport` ABSENT (pas `null`) de ses properties", () => {
    const collection = buildTrailRenderFeatureCollection([trail({ osmId: "way/1", sports: ["bike"] })], new Set(["hike"]));
    expect(collection.features).toHaveLength(1);
    expect("renderSport" in collection.features[0].properties).toBe(false);
  });

  it("calcule isNamedRoute pour chaque feature, sans toucher au contrat MapTrailProperties d'origine", () => {
    const collection = buildTrailRenderFeatureCollection(
      [trail({ osmId: "relation/1", sports: ["hike"], name: "Sentier du Littoral" })],
      ALL_ACTIVE,
    );
    expect(collection.features[0].properties.isNamedRoute).toBe(true);
    expect(collection.features[0].properties.osmId).toBe("relation/1");
  });
});

describe("countRenderedBySport / countRenderedNamedRoutes (§3.5, annonce aria-live)", () => {
  it("compte par sport EFFECTIVEMENT rendu, pas par appartenance brute", () => {
    const collection = buildTrailRenderFeatureCollection(
      [
        trail({ osmId: "way/1", sports: ["trail", "hike"] }), // rendu trail (priorité)
        trail({ osmId: "way/2", sports: ["hike"] }),
        trail({ osmId: "way/3", sports: ["bike"] }),
      ],
      ALL_ACTIVE,
    );
    expect(countRenderedBySport(collection)).toEqual({ route: 0, trail: 1, hike: 1, bike: 1 });
  });

  it("dont N itinéraires balisés — seulement parmi les tracés effectivement rendus", () => {
    const collection = buildTrailRenderFeatureCollection(
      [
        trail({ osmId: "relation/1", sports: ["hike"], name: "Sentier du Littoral" }),
        trail({ osmId: "relation/2", sports: ["bike"], name: "Boucle non affichée" }),
      ],
      new Set(["hike"]),
    );
    expect(countRenderedNamedRoutes(collection)).toBe(1);
  });
});
