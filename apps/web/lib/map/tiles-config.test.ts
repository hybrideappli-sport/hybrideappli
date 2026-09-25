import { afterEach, describe, expect, it, vi } from "vitest";

import { getMapTilesConfig, MissingMapTilesConfigurationError } from "./tiles-config";

describe("getMapTilesConfig (ADR-018 §2, §8)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuse EXPLICITEMENT (fail-closed) si MAP_TILES_STYLE_URL est absente", () => {
    vi.stubEnv("MAP_TILES_STYLE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILES_API_KEY", "");

    expect(() => getMapTilesConfig()).toThrow(MissingMapTilesConfigurationError);
  });

  it("renvoie l'URL de style telle quelle si aucune clé publique n'est configurée", () => {
    vi.stubEnv("MAP_TILES_STYLE_URL", "https://tiles.example/styles/alidade_smooth_dark.json");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILES_API_KEY", "");

    expect(getMapTilesConfig()).toEqual({ styleUrl: "https://tiles.example/styles/alidade_smooth_dark.json" });
  });

  it("ajoute la clé publique en paramètre de requête `api_key`", () => {
    vi.stubEnv("MAP_TILES_STYLE_URL", "https://tiles.example/styles/alidade_smooth_dark.json");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILES_API_KEY", "dev-key-123");

    expect(getMapTilesConfig()).toEqual({
      styleUrl: "https://tiles.example/styles/alidade_smooth_dark.json?api_key=dev-key-123",
    });
  });

  it("utilise `&` si l'URL de style porte déjà des paramètres de requête", () => {
    vi.stubEnv("MAP_TILES_STYLE_URL", "https://tiles.example/styles/alidade_smooth_dark.json?client=hybride");
    vi.stubEnv("NEXT_PUBLIC_MAP_TILES_API_KEY", "dev-key-123");

    expect(getMapTilesConfig()).toEqual({
      styleUrl: "https://tiles.example/styles/alidade_smooth_dark.json?client=hybride&api_key=dev-key-123",
    });
  });
});
