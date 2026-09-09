import { describe, expect, it } from "vitest";

import { isMapTilesPlanProductionReady } from "./tiles-plan-guard";

describe("isMapTilesPlanProductionReady (ADR-018 §8, garde fail-closed MAP_TILES_PLAN)", () => {
  it("autorise le palier gratuit hors production (dev, preview non-production, tests)", () => {
    expect(isMapTilesPlanProductionReady({ NODE_ENV: "development", MAP_TILES_PLAN: undefined })).toBe(true);
    expect(isMapTilesPlanProductionReady({ NODE_ENV: "test", MAP_TILES_PLAN: "free_non_commercial" })).toBe(true);
  });

  it("refuse en production si MAP_TILES_PLAN est absent", () => {
    expect(isMapTilesPlanProductionReady({ NODE_ENV: "production", MAP_TILES_PLAN: undefined })).toBe(false);
  });

  it("refuse en production si MAP_TILES_PLAN vaut 'free_non_commercial'", () => {
    expect(isMapTilesPlanProductionReady({ NODE_ENV: "production", MAP_TILES_PLAN: "free_non_commercial" })).toBe(false);
  });

  it("autorise en production UNIQUEMENT si MAP_TILES_PLAN vaut exactement 'commercial'", () => {
    expect(isMapTilesPlanProductionReady({ NODE_ENV: "production", MAP_TILES_PLAN: "commercial" })).toBe(true);
    expect(isMapTilesPlanProductionReady({ NODE_ENV: "production", MAP_TILES_PLAN: "Commercial" })).toBe(false);
  });
});
