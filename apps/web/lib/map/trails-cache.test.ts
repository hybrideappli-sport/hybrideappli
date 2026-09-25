import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADR-018 — critère d'acceptation L2 n°1 : « deux requêtes sur la même tuile ⟹ un seul appel
 * Overpass. » `next/cache` (`unstable_cache`) exige un contexte de rendu Next.js réel
 * (`workAsyncStorage`) : hors de ce contexte (ici, Vitest), l'implémentation RÉELLE lève une
 * exception (« Invariant: incrementalCache missing »). On la remplace donc par un DOUBLE fidèle au
 * contrat documenté (mémoïsation par `keyParts` + arguments), ce qui permet de tester l'invariant
 * réel de CE module — la composition de la clé — sans dépendre du runtime Next.
 */
const cacheStore = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args]);
      if (cacheStore.has(key)) return cacheStore.get(key);
      const result = await fn(...args);
      cacheStore.set(key, result);
      return result;
    },
}));

const fetchOverpassTile = vi.fn();
vi.mock("./overpass-client", () => ({
  fetchOverpassTile: (...args: unknown[]) => fetchOverpassTile(...args),
  OverpassUnavailableError: class OverpassUnavailableError extends Error {},
}));

const RAW_ELEMENT = {
  type: "way" as const,
  id: 1,
  tags: { highway: "path" },
  geometry: [
    { lat: 48.0, lon: 2.0 },
    { lat: 48.001, lon: 2.001 },
  ],
};

describe("trails-cache — N3 (ADR-018 §4.2-§4.3)", () => {
  beforeEach(() => {
    cacheStore.clear();
    fetchOverpassTile.mockReset();
    fetchOverpassTile.mockResolvedValue([RAW_ELEMENT]);
  });

  it("un seul appel Overpass pour deux requêtes sur la même tuile (critère d'acceptation L2 n°1)", async () => {
    const { getPreparedTileData } = await import("./trails-cache");
    const tile = { z: 12, x: 2062, y: 1408 };

    const first = await getPreparedTileData(tile);
    const second = await getPreparedTileData(tile);

    expect(fetchOverpassTile).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("une tuile différente déclenche un nouvel appel Overpass", async () => {
    const { getPreparedTileData } = await import("./trails-cache");
    await getPreparedTileData({ z: 12, x: 1, y: 1 });
    await getPreparedTileData({ z: 12, x: 2, y: 2 });
    expect(fetchOverpassTile).toHaveBeenCalledTimes(2);
  });

  it("retourne des éléments élagués/simplifiés (PAS bruts Overpass, PAS classés)", async () => {
    const { getPreparedTileData } = await import("./trails-cache");
    const [element] = await getPreparedTileData({ z: 12, x: 5, y: 5 });
    expect(element.osmId).toBe("way/1");
    expect(element.tags).toEqual({ highway: "path" });
    expect(element).not.toHaveProperty("sports");
  });
});
