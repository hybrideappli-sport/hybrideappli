import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.fn();

vi.mock("@hybride/db", () => ({
  createSupabaseServerClient: (...args: unknown[]) => createSupabaseServerClient(...args),
}));

// Import APRÈS le mock (`vi.mock` est hoisté par Vitest, mais un import dynamique garde l'ordre
// explicite et évite toute ambiguïté avec le cache de modules entre les tests de ce fichier).
const { proxy } = await import("./proxy");

function requestFor(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3300"));
}

describe("proxy — garde fail-closed MAP_TILES_PLAN sur /carte (ADR-018 §8)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    createSupabaseServerClient.mockReset();
  });

  it("répond 503 EXPLICITE sur /carte en production si MAP_TILES_PLAN n'est pas 'commercial', SANS toucher à la session Supabase", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAP_TILES_PLAN", "free_non_commercial");

    const response = await proxy(requestFor("/carte"));

    expect(response.status).toBe(503);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("ne gate PAS les autres routes protégées, même en production sans palier commercial", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAP_TILES_PLAN", "free_non_commercial");
    createSupabaseServerClient.mockReturnValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    });

    const response = await proxy(requestFor("/dashboard"));

    // Redirigé vers /connexion (pas d'utilisateur) — PAS un 503 : le garde ne s'applique qu'à /carte.
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connexion");
  });

  it("laisse /carte passer en développement, même sans MAP_TILES_PLAN, et applique la protection d'authentification standard", async () => {
    vi.stubEnv("NODE_ENV", "development");
    createSupabaseServerClient.mockReturnValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    });

    const response = await proxy(requestFor("/carte"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connexion");
    expect(createSupabaseServerClient).toHaveBeenCalledOnce();
  });

  it("laisse /carte passer en production quand MAP_TILES_PLAN vaut 'commercial'", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAP_TILES_PLAN", "commercial");
    createSupabaseServerClient.mockReturnValue({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
    });

    const response = await proxy(requestFor("/carte"));

    expect(response.status).toBe(200);
    expect(createSupabaseServerClient).toHaveBeenCalledOnce();
  });
});
