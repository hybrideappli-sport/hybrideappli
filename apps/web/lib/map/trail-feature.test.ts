import { describe, expect, it } from "vitest";
import { elagageTags, haversineMeters, prepareTileElements, simplifyLine } from "./trail-feature";
import type { OverpassRawElement } from "./overpass-types";

describe("elagageTags — ADR-018 §5.5, liste blanche", () => {
  it("ne garde que les tags de la liste blanche", () => {
    const kept = elagageTags({ highway: "path", surface: "gravel", "not:whitelisted": "x", building: "yes" });
    expect(kept).toEqual({ highway: "path", surface: "gravel" });
  });

  it("tags undefined -> objet vide", () => {
    expect(elagageTags(undefined)).toEqual({});
  });

  it("conserve les clés à deux-points de la liste blanche (`mtb:scale`)", () => {
    expect(elagageTags({ "mtb:scale": "2" })).toEqual({ "mtb:scale": "2" });
  });
});

describe("haversineMeters", () => {
  it("distance nulle pour un point identique", () => {
    expect(haversineMeters([2.35, 48.85], [2.35, 48.85])).toBeCloseTo(0, 3);
  });

  it("~111 km pour 1° de latitude", () => {
    const distance = haversineMeters([2.35, 48.85], [2.35, 49.85]);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });
});

describe("simplifyLine — Douglas-Peucker (ADR-018 §4.4, SIMPLIFY_TOLERANCE_M)", () => {
  it("réduit une ligne quasi rectiligne à ses deux extrémités", () => {
    // Points quasi-alignés sur un segment de ~1 km, écart perpendiculaire << 5 m.
    const points: [number, number][] = [
      [2.0, 48.0],
      [2.0025, 48.0001],
      [2.005, 48.0002],
      [2.0075, 48.0001],
      [2.01, 48.0],
    ];
    const simplified = simplifyLine(points, 5);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it("conserve un coude net (écart perpendiculaire très supérieur à la tolérance)", () => {
    const points: [number, number][] = [
      [2.0, 48.0],
      [2.0, 48.05], // ~5.5 km plus au nord : coude net.
      [2.05, 48.05],
    ];
    const simplified = simplifyLine(points, 5);
    expect(simplified.length).toBe(3);
  });

  it("ne modifie jamais les coordonnées des points conservés (pas de distorsion)", () => {
    const points: [number, number][] = [
      [2.0, 48.0],
      [2.0025, 48.0001],
      [2.005, 48.0002],
    ];
    const simplified = simplifyLine(points, 5);
    for (const point of simplified) {
      expect(points).toContainEqual(point);
    }
  });

  it("laisse une ligne de 2 points inchangée", () => {
    const points: [number, number][] = [
      [2.0, 48.0],
      [2.01, 48.01],
    ];
    expect(simplifyLine(points, 5)).toEqual(points);
  });
});

describe("prepareTileElements — élagage + géométrie, PAS de classement", () => {
  it("way avec géométrie valide -> LineString simplifiée, tags élagués", () => {
    const raw: OverpassRawElement[] = [
      {
        type: "way",
        id: 123,
        tags: { highway: "path", surface: "ground", building: "yes" },
        geometry: [
          { lat: 48.0, lon: 2.0 },
          { lat: 48.001, lon: 2.001 },
        ],
      },
    ];
    const prepared = prepareTileElements(raw);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].osmId).toBe("way/123");
    expect(prepared[0].tags).toEqual({ highway: "path", surface: "ground" });
    expect(prepared[0].geometry.type).toBe("LineString");
  });

  it("way avec moins de 2 points géométriques exploitables est écarté", () => {
    const raw: OverpassRawElement[] = [
      { type: "way", id: 1, tags: { highway: "path" }, geometry: [{ lat: 48.0, lon: 2.0 }] },
      { type: "way", id: 2, tags: { highway: "path" }, geometry: undefined },
    ];
    expect(prepareTileElements(raw)).toHaveLength(0);
  });

  it("relation -> MultiLineString à partir des membres `way`, les nœuds sont ignorés", () => {
    const raw: OverpassRawElement[] = [
      {
        type: "relation",
        id: 456,
        tags: { route: "hiking", name: "GR Test" },
        members: [
          {
            type: "way",
            ref: 1,
            geometry: [
              { lat: 48.0, lon: 2.0 },
              { lat: 48.001, lon: 2.001 },
            ],
          },
          { type: "node", ref: 2, geometry: [{ lat: 48.0005, lon: 2.0005 }] },
          {
            type: "way",
            ref: 3,
            geometry: [
              { lat: 48.002, lon: 2.002 },
              { lat: 48.003, lon: 2.003 },
            ],
          },
        ],
      },
    ];
    const prepared = prepareTileElements(raw);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].osmId).toBe("relation/456");
    expect(prepared[0].geometry.type).toBe("MultiLineString");
    expect((prepared[0].geometry as { coordinates: unknown[] }).coordinates).toHaveLength(2);
  });

  it("relation sans membre `way` exploitable est écartée", () => {
    const raw: OverpassRawElement[] = [{ type: "relation", id: 789, tags: { route: "hiking" }, members: [] }];
    expect(prepareTileElements(raw)).toHaveLength(0);
  });
});
