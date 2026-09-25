import { describe, expect, it } from "vitest";
import { MAX_TILES_PER_REQUEST, TILE_ZOOM, parseBboxParam, tileBounds, tileKey, tilesForBbox } from "./tile-grid";

describe("tileKey", () => {
  it("formate `z/x/y`", () => {
    expect(tileKey({ z: 12, x: 2062, y: 1408 })).toBe("12/2062/1408");
  });
});

describe("tilesForBbox — ADR-018 §4.2, l'arrondi serveur", () => {
  it("une petite bbox à l'intérieur d'une seule tuile renvoie exactement une tuile", () => {
    // Paris, un point unique répété (bbox quasi ponctuelle) reste dans une seule tuile z12.
    const bbox = { minLon: 2.349, minLat: 48.852, maxLon: 2.351, maxLat: 48.854 };
    const tiles = tilesForBbox(bbox, TILE_ZOOM);
    expect(tiles.length).toBe(1);
    expect(tiles[0].z).toBe(TILE_ZOOM);
  });

  it("deux utilisateurs voisins à des zooms différents tapent la MÊME tuile (grille absolue)", () => {
    const narrowViewport = { minLon: 2.349, minLat: 48.852, maxLon: 2.351, maxLat: 48.854 };
    const widerViewport = { minLon: 2.34, minLat: 48.845, maxLon: 2.36, maxLat: 48.86 };
    const narrowTiles = tilesForBbox(narrowViewport, TILE_ZOOM);
    const widerTiles = tilesForBbox(widerViewport, TILE_ZOOM);
    expect(narrowTiles).toEqual([{ z: TILE_ZOOM, x: widerTiles[0].x, y: widerTiles[0].y }]);
  });

  it("une bbox dégénérée (min >= max) renvoie un tableau vide", () => {
    expect(tilesForBbox({ minLon: 2.5, minLat: 48.8, maxLon: 2.5, maxLat: 48.9 })).toEqual([]);
    expect(tilesForBbox({ minLon: 2.5, minLat: 48.9, maxLon: 2.6, maxLat: 48.9 })).toEqual([]);
  });

  it("une bbox à l'échelle d'un continent dépasse MAX_TILES_PER_REQUEST", () => {
    const continent = { minLon: -10, minLat: 35, maxLon: 30, maxLat: 60 };
    const tiles = tilesForBbox(continent, TILE_ZOOM);
    expect(tiles.length).toBeGreaterThan(MAX_TILES_PER_REQUEST);
  });

  it("le panoramique est gratuit : deux bbox adjacentes ne partagent que la tuile de bordure", () => {
    const left = { minLon: 2.30, minLat: 48.80, maxLon: 2.35, maxLat: 48.85 };
    const right = { minLon: 2.40, minLat: 48.80, maxLon: 2.45, maxLat: 48.85 };
    const leftTiles = new Set(tilesForBbox(left, TILE_ZOOM).map(tileKey));
    const rightTiles = new Set(tilesForBbox(right, TILE_ZOOM).map(tileKey));
    const intersection = [...leftTiles].filter((key) => rightTiles.has(key));
    expect(intersection.length).toBeLessThan(leftTiles.size);
  });
});

describe("tileBounds", () => {
  it("est l'inverse cohérent de tilesForBbox : le centre de la bbox d'origine reste dans la tuile calculée", () => {
    const bbox = { minLon: 2.349, minLat: 48.852, maxLon: 2.351, maxLat: 48.854 };
    const [tile] = tilesForBbox(bbox, TILE_ZOOM);
    const bounds = tileBounds(tile);
    expect(bounds.minLon).toBeLessThanOrEqual(bbox.minLon);
    expect(bounds.maxLon).toBeGreaterThanOrEqual(bbox.maxLon);
    expect(bounds.minLat).toBeLessThanOrEqual(bbox.minLat);
    expect(bounds.maxLat).toBeGreaterThanOrEqual(bbox.maxLat);
  });
});

describe("parseBboxParam", () => {
  it("parse une bbox valide", () => {
    expect(parseBboxParam("2.30,48.80,2.35,48.85")).toEqual({ minLon: 2.30, minLat: 48.80, maxLon: 2.35, maxLat: 48.85 });
  });

  it("rejette un nombre de composantes différent de 4", () => {
    expect(parseBboxParam("2.30,48.80,2.35")).toBeNull();
    expect(parseBboxParam("2.30,48.80,2.35,48.85,1")).toBeNull();
  });

  it("rejette une composante non numérique", () => {
    expect(parseBboxParam("a,48.80,2.35,48.85")).toBeNull();
  });

  it("rejette une bbox hors des bornes géographiques", () => {
    expect(parseBboxParam("-200,48.80,2.35,48.85")).toBeNull();
    expect(parseBboxParam("2.30,-100,2.35,48.85")).toBeNull();
    expect(parseBboxParam("2.30,48.80,200,48.85")).toBeNull();
    expect(parseBboxParam("2.30,48.80,2.35,100")).toBeNull();
  });

  it("rejette une bbox dégénérée (min >= max)", () => {
    expect(parseBboxParam("2.35,48.80,2.30,48.85")).toBeNull();
    expect(parseBboxParam("2.30,48.85,2.35,48.80")).toBeNull();
  });
});
