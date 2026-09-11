import { describe, expect, it } from "vitest";

import type { MapSport, MapTrailFeature } from "@hybride/domain";

import { isNamedRoute, pickRenderSport, SPORT_RENDER_PRIORITY } from "./render-sport";

function trail(properties: Partial<MapTrailFeature["properties"]>): MapTrailFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    properties: {
      osmId: "way/1",
      sports: [],
      name: null,
      distanceKm: null,
      elevationGainM: null,
      surface: null,
      surfaceInferred: false,
      osmUrl: "https://www.openstreetmap.org/way/1",
      ...properties,
    },
  };
}

const ALL_ACTIVE = new Set<MapSport>(["route", "trail", "hike", "bike"]);

describe("pickRenderSport (design-carte.md §3.1)", () => {
  it("l'ordre de priorité est Vélo > Trail > Route > Rando", () => {
    expect(SPORT_RENDER_PRIORITY).toEqual(["bike", "trail", "route", "hike"]);
  });

  it("un chemin mono-sport rend ce seul sport, si actif", () => {
    expect(pickRenderSport(["hike"], ALL_ACTIVE)).toBe("hike");
  });

  it("aucun filtre actif ne retient le sport du chemin ⟹ null (non rendu)", () => {
    expect(pickRenderSport(["bike"], new Set(["hike"]))).toBeNull();
  });

  // Table exacte de design-carte.md §3.2 : sports: ['trail', 'hike'].
  it.each<[MapSport[], MapSport | null]>([
    [["trail", "hike"], "trail"],
    [["hike"], "hike"],
  ])("filtres %j actifs sur sports ['trail','hike'] ⟹ %s", (activeArray, expected) => {
    expect(pickRenderSport(["trail", "hike"], new Set(activeArray))).toBe(expected);
  });

  it("décocher une pastille change la couleur des tracés qui restent, sans changer `sports` (§3.2)", () => {
    const sports: MapSport[] = ["trail", "hike"];
    expect(pickRenderSport(sports, new Set(["trail", "hike"]))).toBe("trail");
    expect(pickRenderSport(sports, new Set(["hike"]))).toBe("hike");
    expect(pickRenderSport(sports, new Set(["bike"]))).toBeNull();
  });

  it("Vélo > Route : une piste cyclable revêtue (Route ∩ Vélo) rend en Vélo quand les deux sont actifs", () => {
    expect(pickRenderSport(["route", "bike"], ALL_ACTIVE)).toBe("bike");
  });

  it("Trail > Rando (Trail ⊂ Rando) : R1, sans quoi la teinte Trail ne s'afficherait jamais", () => {
    expect(pickRenderSport(["trail", "hike"], ALL_ACTIVE)).toBe("trail");
  });

  it("Route et Trail ne se rencontrent jamais dans les données (disjoints par construction) — l'ordre entre eux ne joue donc qu'au regard de Vélo", () => {
    // Documenté ici comme propriété de la donnée en amont (classifySports, `@hybride/domain`),
    // pas revérifié par cette fonction qui n'a pas connaissance de la classification.
    expect(pickRenderSport(["route"], ALL_ACTIVE)).toBe("route");
    expect(pickRenderSport(["trail"], ALL_ACTIVE)).toBe("trail");
  });
});

describe("isNamedRoute (design-carte.md §5.7.2)", () => {
  it("relation nommée ⟹ true", () => {
    expect(isNamedRoute(trail({ osmId: "relation/98765", name: "Sentier du Littoral" }))).toBe(true);
  });

  it("relation SANS nom ⟹ false (un itinéraire non nommé n'est jamais promu)", () => {
    expect(isNamedRoute(trail({ osmId: "relation/98765", name: null }))).toBe(false);
  });

  it("way (segment), même nommé, ⟹ false — seules les relations sont promues (§5.7.2)", () => {
    expect(isNamedRoute(trail({ osmId: "way/1234567", name: "Chemin de traverse" }))).toBe(false);
  });
});
