import { MapTrailsQuerySchema, type MapTrailsResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { OverpassUnavailableError } from "@/lib/map/overpass-client";
import { parseBboxParam } from "@/lib/map/tile-grid";
import { getMapTrails } from "@/lib/map/trails-service";
import { FixedWindowRateLimiter } from "@/lib/rate-limit/fixed-window-limiter";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/map/trails?bbox=minLon,minLat,maxLon,maxLat` — ADR-018, lot L2. Authentifiée, hors
 * quota produit, non premium (même régime que `POST /schedule/incidents` — ADR-018, questions
 * ouvertes relayées n°2 : la carte ne consomme ni moteur ni donnée de santé). AUCUN paramètre
 * `sports` (§6) : la route renvoie l'union classée de la tuile, le filtrage par pastille est
 * 100 % client (lot L3).
 *
 * Garde FAIL-CLOSED `MAP_TILES_PLAN` : déjà appliquée EN AMONT par `apps/web/proxy.ts` (étendue
 * lot L2 pour couvrir cette route, même mécanisme que `/carte` en lot L1) — ce handler suppose donc
 * toujours avoir reçu ce feu vert, PAS de revérification ici (chemin de garde UNIQUE).
 *
 * `Cache-Control: private, max-age=600` (N2, ADR-018 §4.3) est une EXCEPTION délibérée à la
 * convention `no-store` des autres routes `/api/v1/**` : `private` (jamais `s-maxage`, un cache CDN
 * partagé sur une route authentifiée serait un risque de fuite) et strictement borné à 10 minutes,
 * ce qui suffit à couvrir un rechargement/retour arrière sans jamais servir une classification
 * périmée plus de 10 minutes après un déploiement qui changerait `CLASSIFIER_VERSION`.
 */
const mapTrailsEntryLimiter = new FixedWindowRateLimiter({
  windowMs: Number(process.env.MAP_TRAILS_RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.MAP_TRAILS_RATE_LIMIT_MAX ?? 30),
});

export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  // N4 — limiteur d'ENTRÉE par utilisateur (ADR-018 §4.3), garde contre un client qui boucle.
  // Distinct du limiteur de CONCURRENCE de sortie vers Overpass (`lib/map/overpass-client.ts`),
  // qui protège Overpass indépendamment de qui a demandé quoi.
  const limit = mapTrailsEntryLimiter.consume(user.id);
  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", "Trop de requêtes — réessaie plus tard.", undefined, {
      "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
    });
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = MapTrailsQuerySchema.safeParse({ bbox: searchParams.get("bbox") });
  if (!parsedQuery.success) {
    return apiError(400, "VALIDATION_FAILED", "`bbox` (minLon,minLat,maxLon,maxLat) est requis.", parsedQuery.error.issues);
  }

  const bbox = parseBboxParam(parsedQuery.data.bbox);
  if (!bbox) {
    return apiError(400, "VALIDATION_FAILED", "`bbox` est malformée ou hors des bornes géographiques.");
  }

  try {
    const trails = await getMapTrails(bbox);
    return apiJson<MapTrailsResponse>(trails, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (error) {
    if (error instanceof OverpassUnavailableError) {
      console.error(`[map/trails] Overpass indisponible : ${error.message}`);
      return apiError(502, "OVERPASS_UNAVAILABLE", "Les tracés sont indisponibles pour le moment. Réessaie.");
    }
    throw error;
  }
}
