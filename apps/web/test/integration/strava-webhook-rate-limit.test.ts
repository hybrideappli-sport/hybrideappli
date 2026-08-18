import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * `strava-webhook-rate-limit.test.ts` — I3 (ADR-013 §1, défense complémentaire jamais implémentée
 * jusqu'à ce lot). Exerce directement `GET`/`POST` de la route (même patron que
 * `stripe-webhook-idempotency.test.ts`) avec un budget volontairement bas
 * (`STRAVA_WEBHOOK_*_RATE_LIMIT_MAX`) pour observer le passage en `429` sans envoyer des centaines
 * de requêtes.
 *
 * Le module est chargé UNE SEULE FOIS après avoir stubé les variables d'environnement
 * (`vi.resetModules()` + import dynamique, même patron que `coach-llm-provider.test.ts`) : le
 * limiteur de débit est un état de MODULE (`fixed-window-limiter.ts`), il doit rester le même objet
 * d'un appel à l'autre pour que le compteur s'incrémente réellement entre les requêtes du test.
 *
 * Les corps de requête `POST` sont volontairement invalides (`{}`) : la route les acquitte tôt
 * (`{ received: true }`, avant toute lecture de `data_connections`), ce qui suffit à exercer le
 * rate limiter sans dépendre de fixtures `data_connections`/`session_logs`.
 */
const PATH_SECRET = "test-strava-webhook-path-secret-01234567";

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/v1/webhooks/strava/[pathSecret]/route");
}

describe("strava-webhook-rate-limit — I3", () => {
  beforeAll(() => {
    vi.stubEnv("STRAVA_CLIENT_ID", "test-client-id");
    vi.stubEnv("STRAVA_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("STRAVA_WEBHOOK_PATH_SECRET", PATH_SECRET);
    vi.stubEnv("STRAVA_VERIFY_TOKEN", "test-verify-token");
    vi.stubEnv("DATA_TOKEN_ENC_KEY", "test-token-enc-key");
    vi.stubEnv("OAUTH_STATE_SECRET", "test-oauth-state-secret");
    vi.stubEnv("STRAVA_WEBHOOK_RATE_LIMIT_WINDOW_MS", "60000");
    vi.stubEnv("STRAVA_WEBHOOK_RATE_LIMIT_MAX", "2");
    vi.stubEnv("STRAVA_WEBHOOK_SUBSCRIBE_RATE_LIMIT_MAX", "2");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("refuse toujours une requête sans le bon secret de chemin, quel que soit le budget de débit", async () => {
    const { GET } = await loadRoute();
    const request = new Request("http://localhost/api/v1/webhooks/strava/wrong?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc");
    const response = await GET(request, { params: Promise.resolve({ pathSecret: "not-the-secret" }) });
    expect(response.status).toBe(403);
  });

  it("POST : accepte jusqu'au budget configuré puis répond 429 avec Retry-After", async () => {
    const { POST } = await loadRoute();

    function postEmptyEvent() {
      return POST(new Request(`http://localhost/api/v1/webhooks/strava/${PATH_SECRET}`, { method: "POST", body: JSON.stringify({}) }), {
        params: Promise.resolve({ pathSecret: PATH_SECRET }),
      });
    }

    const first = await postEmptyEvent();
    expect(first.status).toBe(200);
    const second = await postEmptyEvent();
    expect(second.status).toBe(200);

    const third = await postEmptyEvent();
    expect(third.status).toBe(429);
    const body = (await third.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(third.headers.get("Retry-After")).toBeTruthy();
  });

  it("GET (poignée de main de souscription) : même comportement, budget indépendant du POST", async () => {
    const { GET } = await loadRoute();

    function getSubscribe() {
      const request = new Request(
        `http://localhost/api/v1/webhooks/strava/${PATH_SECRET}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc`,
      );
      return GET(request, { params: Promise.resolve({ pathSecret: PATH_SECRET }) });
    }

    const first = await getSubscribe();
    expect(first.status).toBe(200);
    const second = await getSubscribe();
    expect(second.status).toBe(200);

    const third = await getSubscribe();
    expect(third.status).toBe(429);
  });
});
