import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Même double de `next/cache` que `trails-cache.test.ts` — voir ce fichier pour le rationale
 * (`unstable_cache` exige un contexte de rendu Next.js réel, absent sous Vitest).
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

/** Boîte mutable pour simuler un « bump » de `CLASSIFIER_VERSION` entre deux appels — `vi.hoisted`
 * pour éviter tout problème d'ordre d'évaluation avec le hoisting de `vi.mock`. */
const classifierState = vi.hoisted(() => ({ version: "v1" }));

vi.mock("@hybride/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hybride/domain")>();
  return {
    ...actual,
    // Le contenu réel des tags n'importe pas ici : seul compte le fait que le classement PEUT
    // changer entre deux requêtes sans qu'aucun code de ce module ne le sache par avance.
    classifySports: () => {
      if (classifierState.version === "v1") return ["hike"];
      if (classifierState.version === "v2") return ["hike", "trail"];
      return [];
    },
  };
});

const fetchImpl = vi.fn();

const PARIS_SINGLE_TILE_BBOX = { minLon: 2.349, minLat: 48.852, maxLon: 2.351, maxLat: 48.854 };

function overpassJsonResponse(elements: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ elements }) };
}

const SIMPLE_WAY = {
  type: "way",
  id: 1,
  tags: { highway: "path" },
  geometry: [
    { lat: 48.8531, lon: 2.35 },
    { lat: 48.8535, lon: 2.3505 },
  ],
};

describe("getMapTrails — ADR-018 §4, §6", () => {
  beforeEach(() => {
    cacheStore.clear();
    classifierState.version = "v1";
    fetchImpl.mockReset();
    vi.stubGlobal("fetch", fetchImpl);
  });

  it("critère d'acceptation L2 n°2 : changer le classement ne déclenche AUCUN appel Overpass supplémentaire", async () => {
    fetchImpl.mockResolvedValue(overpassJsonResponse([SIMPLE_WAY]));
    const { getMapTrails } = await import("./trails-service");

    const first = await getMapTrails(PARIS_SINGLE_TILE_BBOX);
    expect(first.status).toBe("ok");
    expect(first.trails).toHaveLength(1);
    expect(first.trails[0].properties.sports).toEqual(["hike"]);

    classifierState.version = "v2"; // simule un déploiement qui bump CLASSIFIER_VERSION.
    const second = await getMapTrails(PARIS_SINGLE_TILE_BBOX);
    expect(second.trails[0].properties.sports).toEqual(["hike", "trail"]); // le classement A changé…

    expect(fetchImpl).toHaveBeenCalledTimes(1); // … mais Overpass n'a été appelé qu'UNE FOIS.
  });

  it("un chemin qu'aucun sport ne retient est écarté, jamais envoyé au client", async () => {
    classifierState.version = "none"; // classifySports() du mock renvoie ["hike"] uniquement pour v1/v2 -> forcer vide autrement.
    fetchImpl.mockResolvedValue(overpassJsonResponse([SIMPLE_WAY]));
    const { getMapTrails } = await import("./trails-service");
    const result = await getMapTrails(PARIS_SINGLE_TILE_BBOX);
    expect(result.trails).toHaveLength(0);
  });

  it("bbox dégénérée -> zoom_required, sans aucun appel Overpass", async () => {
    const { getMapTrails } = await import("./trails-service");
    const result = await getMapTrails({ minLon: 2.5, minLat: 48.5, maxLon: 2.5, maxLat: 48.6 });
    expect(result).toMatchObject({ status: "zoom_required", degraded: false, truncated: false, tiles: [], trails: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bbox à l'échelle d'un continent (> 9 tuiles) -> zoom_required, sans aucun appel Overpass", async () => {
    const { getMapTrails } = await import("./trails-service");
    const result = await getMapTrails({ minLon: -10, minLat: 35, maxLon: 30, maxLat: 60 });
    expect(result.status).toBe("zoom_required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("dégradation partielle : une tuile en échec ne fait pas échouer toute la réponse (degraded: true)", async () => {
    // bbox à cheval sur deux tuiles z12 voisines.
    const twoTileBbox = { minLon: 2.30, minLat: 48.80, maxLon: 2.45, maxLat: 48.85 };
    let call = 0;
    fetchImpl.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw new Error("Overpass indisponible");
      return overpassJsonResponse([SIMPLE_WAY]);
    });

    const { getMapTrails } = await import("./trails-service");
    const result = await getMapTrails(twoTileBbox);

    expect(result.status).toBe("ok");
    expect(result.degraded).toBe(true);
    expect(result.tiles.length).toBeGreaterThanOrEqual(1);
  });

  it("échec TOTAL (toutes les tuiles échouent) -> OverpassUnavailableError, traduit en 502 par la route", async () => {
    fetchImpl.mockRejectedValue(new Error("Overpass indisponible"));
    const { getMapTrails } = await import("./trails-service");
    const { OverpassUnavailableError } = await import("./overpass-client");
    await expect(getMapTrails(PARIS_SINGLE_TILE_BBOX)).rejects.toBeInstanceOf(OverpassUnavailableError);
  });

  it("truncated: true quand une tuile dépasse MAX_FEATURES_PER_TILE, jamais silencieux", async () => {
    const { MAX_FEATURES_PER_TILE } = await import("./constants");
    const manyWays = Array.from({ length: MAX_FEATURES_PER_TILE + 1 }, (_, index) => ({
      type: "way",
      id: index + 1,
      tags: { highway: "path" },
      geometry: [
        { lat: 48.853, lon: 2.35 + index * 0.00001 },
        { lat: 48.8535, lon: 2.3505 + index * 0.00001 },
      ],
    }));
    fetchImpl.mockResolvedValue(overpassJsonResponse(manyWays));

    const { getMapTrails } = await import("./trails-service");
    const result = await getMapTrails(PARIS_SINGLE_TILE_BBOX);

    expect(result.truncated).toBe(true);
    expect(result.trails.length).toBe(MAX_FEATURES_PER_TILE);
  });

  it("attribution ODbL présente dans chaque réponse", async () => {
    fetchImpl.mockResolvedValue(overpassJsonResponse([SIMPLE_WAY]));
    const { getMapTrails } = await import("./trails-service");
    const { MAP_ATTRIBUTION_TEXT } = await import("./attribution");
    const result = await getMapTrails(PARIS_SINGLE_TILE_BBOX);
    expect(result.attribution).toBe(MAP_ATTRIBUTION_TEXT);
  });
});
