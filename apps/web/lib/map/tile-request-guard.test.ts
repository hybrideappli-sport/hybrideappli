import { describe, expect, it, vi } from "vitest";

import { createTileRequestGuard, TRANSPARENT_TILE_DATA_URL } from "./tile-request-guard";

describe("createTileRequestGuard (ADR-018, question ouverte n°2, plafond `transformRequest`)", () => {
  it("laisse passer les requêtes de tuiles inchangées tant que le plafond n'est pas atteint", () => {
    const onCapReached = vi.fn();
    const guard = createTileRequestGuard(2, onCapReached);

    expect(guard("https://tiles.example/1", "Tile")).toEqual({ url: "https://tiles.example/1" });
    expect(guard("https://tiles.example/2", "Tile")).toEqual({ url: "https://tiles.example/2" });
    expect(onCapReached).not.toHaveBeenCalled();
  });

  it("réécrit vers un pixel transparent et notifie UNE SEULE FOIS au-delà du plafond", () => {
    const onCapReached = vi.fn();
    const guard = createTileRequestGuard(1, onCapReached);

    expect(guard("https://tiles.example/1", "Tile")).toEqual({ url: "https://tiles.example/1" });
    expect(guard("https://tiles.example/2", "Tile")).toEqual({ url: TRANSPARENT_TILE_DATA_URL });
    expect(guard("https://tiles.example/3", "Tile")).toEqual({ url: TRANSPARENT_TILE_DATA_URL });
    expect(onCapReached).toHaveBeenCalledOnce();
  });

  it("ne compte JAMAIS les requêtes qui ne sont pas des tuiles (style, sprite, glyphes…)", () => {
    const onCapReached = vi.fn();
    const guard = createTileRequestGuard(1, onCapReached);

    for (let i = 0; i < 10; i += 1) {
      expect(guard("https://tiles.example/style.json", "Style")).toEqual({ url: "https://tiles.example/style.json" });
    }
    expect(onCapReached).not.toHaveBeenCalled();

    // Le plafond, lui, ne s'applique qu'aux tuiles : la première (et seule) requête de tuile passe.
    expect(guard("https://tiles.example/1", "Tile")).toEqual({ url: "https://tiles.example/1" });
    expect(guard("https://tiles.example/2", "Tile")).toEqual({ url: TRANSPARENT_TILE_DATA_URL });
  });
});
