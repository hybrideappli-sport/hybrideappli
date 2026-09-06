import { afterEach, describe, expect, it, vi } from "vitest";
import { OverpassUnavailableError, fetchOverpassTile } from "./overpass-client";

const TILE = { z: 12, x: 2062, y: 1408 };

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchOverpassTile — ADR-018 §4.3 (User-Agent, timeout, concurrence)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("envoie un User-Agent identifiant l'application et un contact (politique d'usage OSM)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchOverpassTile(TILE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/HybrideClub/);
    expect(headers["User-Agent"]).toContain("@");
  });

  it("filtre les éléments `node` isolés, ne garde que way/relation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        elements: [
          { type: "node", id: 1, lat: 48.0, lon: 2.0 },
          { type: "way", id: 2, tags: {}, geometry: [{ lat: 48.0, lon: 2.0 }] },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const elements = await fetchOverpassTile(TILE);
    expect(elements).toHaveLength(1);
    expect(elements[0].type).toBe("way");
  });

  it("lève OverpassUnavailableError sur un statut HTTP non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 503 })));
    await expect(fetchOverpassTile(TILE)).rejects.toBeInstanceOf(OverpassUnavailableError);
  });

  it("lève OverpassUnavailableError sur une erreur réseau (fetch rejeté)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(fetchOverpassTile(TILE)).rejects.toBeInstanceOf(OverpassUnavailableError);
  });

  it("lève OverpassUnavailableError sur une réponse JSON qui ne respecte pas le schéma attendu", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ notElements: [] })));
    await expect(fetchOverpassTile(TILE)).rejects.toBeInstanceOf(OverpassUnavailableError);
  });

  it("borne la concurrence sortante à 2 (N4, ADR-018 §4.3)", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return jsonResponse({ elements: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      fetchOverpassTile({ z: 12, x: 1, y: 1 }),
      fetchOverpassTile({ z: 12, x: 2, y: 2 }),
      fetchOverpassTile({ z: 12, x: 3, y: 3 }),
      fetchOverpassTile({ z: 12, x: 4, y: 4 }),
    ]);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
