import { describe, expect, it } from "vitest";
import { OVERPASS_HIGHWAY_VALUES, OVERPASS_ROUTE_VALUES, OVERPASS_TIMEOUT_SECONDS, buildOverpassQuery } from "./overpass-query";

describe("buildOverpassQuery — ADR-018 §5.5, §4.3 (politique d'usage OSM)", () => {
  const tile = { z: 12, x: 2062, y: 1408 };
  const query = buildOverpassQuery(tile);

  it("porte un [timeout:25] explicite", () => {
    expect(query).toContain(`[timeout:${OVERPASS_TIMEOUT_SECONDS}]`);
    expect(OVERPASS_TIMEOUT_SECONDS).toBe(25);
  });

  it("porte [out:json]", () => {
    expect(query).toContain("[out:json]");
  });

  it("filtre les way sur le périmètre exact de highway retenu (§5.5), hors voirie ordinaire", () => {
    for (const value of OVERPASS_HIGHWAY_VALUES) {
      expect(query).toContain(value);
    }
    expect(query).not.toContain("residential");
    expect(query).not.toContain("tertiary");
  });

  it("exclut access=private|no", () => {
    expect(query).toContain('["access"!~"^(private|no)$"]');
  });

  it("filtre les relations d'itinéraire sur type=route et le périmètre exact des valeurs `route`", () => {
    expect(query).toContain('["type"="route"]');
    for (const value of OVERPASS_ROUTE_VALUES) {
      expect(query).toContain(value);
    }
  });

  it("bbox au format Overpass (minLat,minLon,maxLat,maxLon), pas l'ordre GeoJSON", () => {
    // Tuile 12/2062/1408 est en France métropolitaine : latitude ~48-49, longitude ~2-3.
    const bboxMatch = /\(([\d.,-]+)\);\n {2}relation/.exec(query);
    expect(bboxMatch).not.toBeNull();
    const [minLat, minLon, maxLat, maxLon] = bboxMatch![1].split(",").map(Number);
    expect(minLat).toBeGreaterThan(40);
    expect(maxLat).toBeGreaterThan(40);
    expect(minLon).toBeGreaterThan(-10);
    expect(minLon).toBeLessThan(20);
    expect(maxLon).toBeGreaterThan(minLon);
    expect(maxLat).toBeGreaterThan(minLat);
  });

  it("demande géométrie + tags sans recursion explicite", () => {
    expect(query.trim().endsWith("out tags geom;")).toBe(true);
  });

  it("est déterministe : deux appels sur la même tuile produisent le même texte (clé de cache stable)", () => {
    expect(buildOverpassQuery(tile)).toBe(query);
  });

  it("varie avec la tuile", () => {
    expect(buildOverpassQuery({ z: 12, x: 2063, y: 1408 })).not.toBe(query);
  });
});
