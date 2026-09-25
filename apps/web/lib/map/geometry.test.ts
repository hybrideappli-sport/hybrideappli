import { describe, expect, it } from "vitest";

import { distancePointToPoint, distancePointToPolyline, distancePointToPolylines } from "./geometry";

describe("distancePointToPoint", () => {
  it("distance euclidienne simple", () => {
    expect(distancePointToPoint([0, 0], [3, 4])).toBe(5);
  });
});

describe("distancePointToPolyline", () => {
  it("polyligne vide ⟹ Infinity", () => {
    expect(distancePointToPolyline([0, 0], [])).toBe(Infinity);
  });

  it("un seul point ⟹ distance au point", () => {
    expect(distancePointToPolyline([0, 0], [[3, 4]])).toBe(5);
  });

  it("projette perpendiculairement sur le segment le plus proche", () => {
    // Segment horizontal de (0,0) à (10,0) ; le point (5,3) est à 3 de sa projection (5,0).
    expect(distancePointToPolyline([5, 3], [[0, 0], [10, 0]])).toBe(3);
  });

  it("se rabat sur l'extrémité la plus proche hors segment", () => {
    expect(distancePointToPolyline([-5, 0], [[0, 0], [10, 0]])).toBe(5);
  });

  it("prend le minimum sur plusieurs segments", () => {
    expect(distancePointToPolyline([5, 1], [[0, 0], [0, 10], [10, 10]])).toBe(5);
  });
});

describe("distancePointToPolylines (MultiLineString)", () => {
  it("prend le minimum entre plusieurs polylignes", () => {
    const lines = [
      [[0, 0], [10, 0]] as [number, number][],
      [[0, 5], [10, 5]] as [number, number][],
    ];
    expect(distancePointToPolylines([5, 4], lines)).toBe(1);
  });
});
