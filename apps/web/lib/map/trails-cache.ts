import "server-only";

/**
 * N3 — Data Cache Next.js (`unstable_cache`) sur les données BRUTES, PAS classées (ADR-018
 * §4.2-§4.3). C'est le SEUL niveau qui protège réellement Overpass : au plus une requête Overpass
 * par tuile, par 24 h, pour l'ensemble des utilisateurs.
 *
 * Clé effective = `keyParts` (`['overpass', OVERPASS_QUERY_VERSION]`, figée au chargement du
 * module) + les ARGUMENTS de la fonction cachée (`z`, `x`, `y`) — `unstable_cache` inclut ces
 * derniers automatiquement dans la clé d'invocation (voir sa documentation : « uses the arguments
 * […] as the cache key »). C'est exactement `['overpass', OVERPASS_QUERY_VERSION, tuile]`
 * (ADR-018 §4.2).
 *
 * `CLASSIFIER_VERSION` (`@hybride/domain`) N'APPARAÎT NULLE PART DANS CE FICHIER — c'est la
 * garantie architecturale, pas seulement documentaire, que régler le classement ne coûte JAMAIS un
 * appel Overpass (§4.1) : la classification consomme le RÉSULTAT de ce module, elle n'entre jamais
 * dans sa clé. Voir `trails-service.test.ts` pour la preuve exécutable (critère d'acceptation L2
 * n°2).
 */
import { unstable_cache } from "next/cache";

import { fetchOverpassTile } from "./overpass-client";
import { OVERPASS_QUERY_VERSION } from "./overpass-query";
import { prepareTileElements, type PreparedTileElement } from "./trail-feature";
import type { TileCoord } from "./tile-grid";

/** ADR-018 §4.3 — TTL 24 h : la géométrie outdoor d'OSM évolue à l'échelle de la semaine. */
const REVALIDATE_SECONDS = 86_400;

const getCachedTileElements = unstable_cache(
  async (z: number, x: number, y: number): Promise<PreparedTileElement[]> => {
    const rawElements = await fetchOverpassTile({ z, x, y });
    return prepareTileElements(rawElements);
  },
  ["overpass", OVERPASS_QUERY_VERSION],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * Donnée BRUTE (élaguée + simplifiée, PAS classée) d'une tuile, via le Data Cache Next.js. Deux
 * appels sur la même tuile, tant que `OVERPASS_QUERY_VERSION` n'a pas changé et que le TTL n'est pas
 * expiré, ne déclenchent qu'UN SEUL appel Overpass (critère d'acceptation L2 n°1).
 */
export async function getPreparedTileData(tile: TileCoord): Promise<PreparedTileElement[]> {
  return getCachedTileElements(tile.z, tile.x, tile.y);
}
