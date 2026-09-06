import "server-only";

/**
 * SEUL module du dépôt à connaître l'URL du serveur Overpass (ADR-018 §3) — règle vérifiable par
 * `grep`, testée par `overpass-url-single-module.test.ts` (patron du chemin d'écriture unique
 * d'ADR-004 §2 / ADR-016 §2). N'exporte JAMAIS l'URL elle-même : seule une fonction de fetch,
 * `fetchOverpassTile()`.
 *
 * Politique d'usage des serveurs Overpass publics (ADR-018 §4.3, N4) : `User-Agent` identifiant
 * l'application et un contact, `[timeout:25]` porté par la requête elle-même
 * (`overpass-query.ts`), concurrence sortante bornée à 2 (les serveurs Overpass publics comptent en
 * créneaux simultanés par IP).
 */
import { buildOverpassQuery } from "./overpass-query";
import { createConcurrencyLimiter } from "./concurrency-limiter";
import { OverpassResponseSchema, isWayOrRelation, type OverpassRawElement } from "./overpass-types";
import type { TileCoord } from "./tile-grid";
import { tileKey } from "./tile-grid";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

/** ADR-018 §4.3 — N4 : concurrence sortante bornée à 2 vers Overpass. */
const OVERPASS_MAX_CONCURRENT_REQUESTS = 2;

/** Marge au-dessus du `[timeout:25]` côté serveur Overpass — laisse le temps à la réponse HTTP de revenir. */
const OVERPASS_FETCH_TIMEOUT_MS = 30_000;

const overpassContact = process.env.OVERPASS_CONTACT_EMAIL || "contact@hybride.club";
const OVERPASS_USER_AGENT = `HybrideClub-CarteTraces/1.0 (+${overpassContact})`;

const overpassConcurrencyLimiter = createConcurrencyLimiter(OVERPASS_MAX_CONCURRENT_REQUESTS);

export class OverpassUnavailableError extends Error {}

async function postOverpassQuery(query: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_FETCH_TIMEOUT_MS);
  try {
    return await fetch(OVERPASS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": OVERPASS_USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Récupère la donnée BRUTE (non élaguée, non simplifiée, non classée) d'UNE tuile — une requête
 * Overpass par appel. C'est cette fonction que `trails-cache.ts` place derrière `unstable_cache`
 * (N3) : sans le cache, deux requêtes sur la même tuile appelleraient Overpass deux fois — la
 * protection vient du CACHE, pas de ce module, qui ne fait qu'un appel réseau discipliné.
 */
export async function fetchOverpassTile(tile: TileCoord): Promise<OverpassRawElement[]> {
  return overpassConcurrencyLimiter.run(async () => {
    let response: Response;
    try {
      response = await postOverpassQuery(buildOverpassQuery(tile));
    } catch (error) {
      throw new OverpassUnavailableError(`Overpass injoignable (tuile ${tileKey(tile)}) : ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new OverpassUnavailableError(`Overpass a répondu ${response.status} (tuile ${tileKey(tile)}).`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new OverpassUnavailableError(`Réponse Overpass illisible (tuile ${tileKey(tile)}) : ${(error as Error).message}`);
    }

    const parsed = OverpassResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new OverpassUnavailableError(`Réponse Overpass invalide (tuile ${tileKey(tile)}).`);
    }

    return parsed.data.elements.filter(isWayOrRelation);
  });
}
