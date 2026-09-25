import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/api/require-user", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const getMapTrails = vi.fn();
vi.mock("@/lib/map/trails-service", () => ({ getMapTrails: (...args: unknown[]) => getMapTrails(...args) }));

const OK_RESPONSE = {
  status: "ok" as const,
  degraded: false,
  truncated: false,
  tiles: ["12/2062/1408"],
  attribution: "© les contributeurs d'OpenStreetMap",
  trails: [],
};

function requestFor(url: string): Request {
  return new Request(url);
}

describe("GET /api/v1/map/trails — ADR-018, lot L2", () => {
  beforeEach(() => {
    requireUser.mockReset();
    getMapTrails.mockReset();
    vi.unstubAllEnvs();
    vi.resetModules(); // ré-instancie `mapTrailsEntryLimiter` (état module-level) à chaque test.
  });

  it("401 sans utilisateur authentifié, ne consulte même pas getMapTrails", async () => {
    requireUser.mockResolvedValue({ user: null });
    const { GET } = await import("./route");

    const response = await GET(requestFor("http://localhost/api/v1/map/trails?bbox=2.3,48.8,2.4,48.9"));

    expect(response.status).toBe(401);
    expect(getMapTrails).not.toHaveBeenCalled();
  });

  it("400 si `bbox` est absent", async () => {
    requireUser.mockResolvedValue({ user: { id: "u1" } });
    const { GET } = await import("./route");

    const response = await GET(requestFor("http://localhost/api/v1/map/trails"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("400 si `bbox` est malformée (dégénérée ou hors bornes)", async () => {
    requireUser.mockResolvedValue({ user: { id: "u1" } });
    const { GET } = await import("./route");

    const response = await GET(requestFor("http://localhost/api/v1/map/trails?bbox=200,48.8,2.4,48.9"));

    expect(response.status).toBe(400);
    expect(getMapTrails).not.toHaveBeenCalled();
  });

  it("200 avec le contrat renvoyé par getMapTrails, Cache-Control private (PAS no-store)", async () => {
    requireUser.mockResolvedValue({ user: { id: "u1" } });
    getMapTrails.mockResolvedValue(OK_RESPONSE);
    const { GET } = await import("./route");

    const response = await GET(requestFor("http://localhost/api/v1/map/trails?bbox=2.3,48.8,2.4,48.9"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600");
    const body = await response.json();
    expect(body).toEqual(OK_RESPONSE);
    // Le paramètre `sports` n'existe pas dans le contrat (ADR-018 §6) — même en le fournissant, la
    // route ne le lit jamais (aucune assertion sur `sports` ne serait significative ici : c'est
    // l'ABSENCE de tout traitement de ce paramètre qui est la propriété testée par construction du
    // handler, voir la revue de code).
  });

  it("502 OVERPASS_UNAVAILABLE quand getMapTrails lève OverpassUnavailableError (échec total)", async () => {
    requireUser.mockResolvedValue({ user: { id: "u1" } });
    const { OverpassUnavailableError } = await import("@/lib/map/overpass-client");
    getMapTrails.mockRejectedValue(new OverpassUnavailableError("toutes les tuiles ont échoué"));
    const { GET } = await import("./route");

    const response = await GET(requestFor("http://localhost/api/v1/map/trails?bbox=2.3,48.8,2.4,48.9"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("OVERPASS_UNAVAILABLE");
  });

  it("429 RATE_LIMITED après MAP_TRAILS_RATE_LIMIT_MAX requêtes de l'utilisateur dans la fenêtre", async () => {
    vi.stubEnv("MAP_TRAILS_RATE_LIMIT_MAX", "2");
    vi.stubEnv("MAP_TRAILS_RATE_LIMIT_WINDOW_MS", "60000");
    requireUser.mockResolvedValue({ user: { id: "u1" } });
    getMapTrails.mockResolvedValue(OK_RESPONSE);
    const { GET } = await import("./route");
    const url = "http://localhost/api/v1/map/trails?bbox=2.3,48.8,2.4,48.9";

    expect((await GET(requestFor(url))).status).toBe(200);
    expect((await GET(requestFor(url))).status).toBe(200);
    const third = await GET(requestFor(url));

    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).not.toBeNull();
  });

  it("le limiteur d'entrée est PAR UTILISATEUR : un autre utilisateur n'est pas affecté", async () => {
    vi.stubEnv("MAP_TRAILS_RATE_LIMIT_MAX", "1");
    getMapTrails.mockResolvedValue(OK_RESPONSE);
    const { GET } = await import("./route");
    const url = "http://localhost/api/v1/map/trails?bbox=2.3,48.8,2.4,48.9";

    requireUser.mockResolvedValue({ user: { id: "u1" } });
    expect((await GET(requestFor(url))).status).toBe(200);
    expect((await GET(requestFor(url))).status).toBe(429);

    requireUser.mockResolvedValue({ user: { id: "u2" } });
    expect((await GET(requestFor(url))).status).toBe(200);
  });
});
