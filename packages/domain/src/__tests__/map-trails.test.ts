/**
 * ADR-018 §5.3/§5.4 — critère d'acceptation L2 n°4 : la table de cas du §5.3 est couverte, DONT les
 * chevauchements `Trail ⊂ Rando` et `Route ∩ Vélo`.
 */

import { describe, expect, it } from "vitest";
import { classifySports, MAP_SPORTS, type OsmTags } from "../map-trails.js";

describe("classifySports — ADR-018 §5.3 (cas simples, un seul sport)", () => {
  it("Route : footway revêtu présumé, non technique", () => {
    const tags: OsmTags = { highway: "footway" };
    expect(classifySports(tags)).toEqual(["route"]);
  });

  it("Vélo seul : cycleway sans `foot`, revêtu présumé, non ouvert aux piétons", () => {
    const tags: OsmTags = { highway: "cycleway" };
    expect(classifySports(tags)).toEqual(["bike"]);
  });

  it("Rando seule (non étroite) : track non revêtu (`tracktype` ≠ grade1) — jamais Trail (`track` exclu de « étroit »)", () => {
    const tags: OsmTags = { highway: "track", tracktype: "grade3" };
    expect(classifySports(tags)).toEqual(["hike"]);
  });
});

describe("classifySports — chevauchements VOULUS (§5.4)", () => {
  it("Trail ⊂ Rando : sentier étroit non revêtu, quelle que soit la difficulté", () => {
    const tags: OsmTags = { highway: "path" };
    const sports = classifySports(tags);
    expect(sports).toEqual(["trail", "hike"]);
    expect(sports).toContain("trail");
    expect(sports).toContain("hike");
  });

  it("Trail ⊂ Rando reste vrai même technique (Rando « y compris techniques », §5.3)", () => {
    const tags: OsmTags = { highway: "path", sac_scale: "alpine_hiking" };
    expect(classifySports(tags)).toEqual(["trail", "hike"]);
  });

  it("Route ∩ Vélo : piste cyclable asphaltée ouverte aux piétons", () => {
    const tags: OsmTags = { highway: "cycleway", foot: "yes" };
    const sports = classifySports(tags);
    expect(sports).toEqual(["route", "bike"]);
    expect(sports).toContain("route");
    expect(sports).toContain("bike");
  });

  it("l'ordre renvoyé suit toujours MAP_SPORTS, jamais l'ordre d'évaluation interne", () => {
    const tags: OsmTags = { highway: "cycleway", foot: "yes" };
    const sports = classifySports(tags);
    const indices = sports.map((sport) => MAP_SPORTS.indexOf(sport));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe("classifySports — exclusions explicites", () => {
  it("Route exclut le technique : footway revêtu mais `smoothness=impassable`", () => {
    const tags: OsmTags = { highway: "footway", surface: "asphalt", smoothness: "impassable" };
    // Ni Route (technique), ni Trail/Rando (revêtu), ni Vélo (pas cycleway, `bicycle` absent).
    expect(classifySports(tags)).toEqual([]);
  });

  it("`foot=no` exclut Route/Trail/Rando même sur un `highway` normalement implicite", () => {
    const tags: OsmTags = { highway: "path", foot: "no" };
    expect(classifySports(tags)).toEqual([]);
  });

  it("`bicycle=no` exclut Vélo même sur un `cycleway`", () => {
    const tags: OsmTags = { highway: "cycleway", bicycle: "no" };
    expect(classifySports(tags)).toEqual([]);
  });

  it("seuil de largeur « étroit » : > 2 m exclut Trail mais laisse Rando", () => {
    const wide: OsmTags = { highway: "path", width: "2.5" };
    expect(classifySports(wide)).toEqual(["hike"]);

    const narrow: OsmTags = { highway: "path", width: "1.5" };
    expect(classifySports(narrow)).toEqual(["trail", "hike"]);

    const exactlyTwo: OsmTags = { highway: "path", width: "2" };
    expect(classifySports(exactlyTwo)).toEqual(["trail", "hike"]);
  });

  it("surface explicitement non revêtue (hors liste blanche pavée) : `mud`", () => {
    const tags: OsmTags = { highway: "path", surface: "mud" };
    expect(classifySports(tags)).toEqual(["trail", "hike"]);
  });

  it("surface explicitement revêtue exotique de la liste blanche : `sett`", () => {
    const tags: OsmTags = { highway: "path", surface: "sett", foot: "yes" };
    // path + revêtu -> Route (piéton admis, revêtu, non technique) ; plus Trail/Rando (revêtu -> exclus).
    expect(classifySports(tags)).toEqual(["route"]);
  });
});

describe("classifySports — relations d'itinéraire (§5.5), classement direct par `route`", () => {
  it("`route=running` → Route", () => {
    expect(classifySports({ route: "running" })).toEqual(["route"]);
  });

  it("`route=hiking` → Rando", () => {
    expect(classifySports({ route: "hiking" })).toEqual(["hike"]);
  });

  it("`route=foot` → Rando", () => {
    expect(classifySports({ route: "foot" })).toEqual(["hike"]);
  });

  it("`route=bicycle` → Vélo", () => {
    expect(classifySports({ route: "bicycle" })).toEqual(["bike"]);
  });

  it("`route` non reconnu → aucun sport", () => {
    expect(classifySports({ route: "horse" })).toEqual([]);
  });
});

describe("classifySports — cas dégénéré", () => {
  it("ni `highway` ni `route` exploitable → aucun sport", () => {
    expect(classifySports({ name: "Chemin mystère" })).toEqual([]);
  });
});
