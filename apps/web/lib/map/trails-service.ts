import "server-only";

/**
 * Orchestration de `GET /api/v1/map/trails` (ADR-018 §4, §6, lot L2) : bbox arrondie → tuiles →
 * lecture N3 (`trails-cache.ts`, données brutes) → classement (`classifySports()`,
 * `@hybride/domain`, appliqué À CHAQUE requête, JAMAIS mis en cache) → dédoublonnage inter-tuiles →
 * plafonnement par tuile → réponse.
 *
 * Le classement est déclenché ICI, après lecture du cache — la SÉPARATION structurelle entre
 * `trails-cache.ts` (qui ne connaît que `OVERPASS_QUERY_VERSION`) et ce module (le seul à importer
 * `classifySports()`/`CLASSIFIER_VERSION`) est ce qui garantit que régler le classement ne
 * déclenche jamais un appel Overpass (critère d'acceptation L2 n°2, testé dans
 * `trails-service.test.ts`).
 */
import { classifySports, type MapSport, type MapTrailFeature, type MapTrailsResponse } from "@hybride/domain";

import { MAP_ATTRIBUTION_TEXT } from "./attribution";
import { MAX_FEATURES_PER_TILE } from "./constants";
import { OverpassUnavailableError } from "./overpass-client";
import { haversineMeters, type PreparedTileElement } from "./trail-feature";
import { getPreparedTileData } from "./trails-cache";
import { MAX_TILES_PER_REQUEST, TILE_ZOOM, tileKey, tilesForBbox, type BoundingBox, type TileCoord } from "./tile-grid";

const ZOOM_REQUIRED_RESPONSE: MapTrailsResponse = {
  status: "zoom_required",
  degraded: false,
  truncated: false,
  tiles: [],
  attribution: MAP_ATTRIBUTION_TEXT,
  trails: [],
};

function computeDistanceKm(element: PreparedTileElement): number | null {
  const tagDistance = element.tags.distance ? Number(element.tags.distance) : NaN;
  if (Number.isFinite(tagDistance) && tagDistance > 0) return tagDistance;

  const lines = element.geometry.type === "LineString" ? [element.geometry.coordinates] : element.geometry.coordinates;
  let meters = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) meters += haversineMeters(line[i - 1], line[i]);
  }
  return meters > 0 ? Math.round((meters / 1000) * 10) / 10 : null;
}

function buildFeature(element: PreparedTileElement, sports: MapSport[]): MapTrailFeature {
  return {
    type: "Feature",
    geometry: element.geometry,
    properties: {
      osmId: element.osmId,
      sports,
      name: element.tags.name ?? null,
      distanceKm: computeDistanceKm(element),
      elevationGainM: null,
      surface: element.tags.surface ?? null,
      surfaceInferred: element.tags.surface === undefined,
      osmUrl: `https://www.openstreetmap.org/${element.osmId}`,
    },
  };
}

/** Classe les éléments d'UNE tuile, écarte ceux qu'aucun sport ne retient (§4.4), puis plafonne. */
function classifyAndCapTile(elements: PreparedTileElement[]): { features: MapTrailFeature[]; truncated: boolean } {
  const classified: MapTrailFeature[] = [];
  for (const element of elements) {
    const sports = classifySports(element.tags);
    if (sports.length === 0) continue; // jamais envoyé au client (§4.4).
    classified.push(buildFeature(element, sports));
  }
  const truncated = classified.length > MAX_FEATURES_PER_TILE;
  return { features: classified.slice(0, MAX_FEATURES_PER_TILE), truncated };
}

/**
 * `bbox` DÉJÀ validée et parsée (`tile-grid.ts`, `parseBboxParam`) — cette fonction ne revalide
 * rien, elle projette sur la grille et orchestre. `status: 'zoom_required'` en `200` : sous
 * `TILE_ZOOM` (bbox trop large pour rester sous `MAX_TILES_PER_REQUEST`) ou au-delà de
 * `MAX_TILES_PER_REQUEST` tuiles — jamais une requête Overpass sur un continent (§4.4).
 *
 * Lève `OverpassUnavailableError` UNIQUEMENT si TOUTES les tuiles ont échoué (échec total, §4.4 :
 * « seul un échec total renvoie une erreur ») — l'appelant (la route) la traduit en `502
 * OVERPASS_UNAVAILABLE`. Un échec PARTIEL ne lève rien : `degraded: true`, les tuiles servies.
 */
export async function getMapTrails(bbox: BoundingBox): Promise<MapTrailsResponse> {
  const tiles = tilesForBbox(bbox, TILE_ZOOM);
  if (tiles.length === 0 || tiles.length > MAX_TILES_PER_REQUEST) {
    return ZOOM_REQUIRED_RESPONSE;
  }

  const settled = await Promise.allSettled(tiles.map((tile) => getPreparedTileData(tile)));

  let degraded = false;
  let truncated = false;
  const servedTiles: string[] = [];
  const byOsmId = new Map<string, MapTrailFeature>();

  settled.forEach((result, index) => {
    const tile: TileCoord = tiles[index];
    if (result.status === "rejected") {
      degraded = true;
      console.error(`[map/trails] tuile ${tileKey(tile)} indisponible : ${describeError(result.reason)}`);
      return;
    }

    servedTiles.push(tileKey(tile));
    const { features, truncated: tileTruncated } = classifyAndCapTile(result.value);
    if (tileTruncated) truncated = true;
    for (const feature of features) {
      // Dédoublonnage inter-tuiles (§5.5) : un chemin à cheval sur deux tuiles apparaît dans les
      // deux extractions — premier arrivé (ordre stable des tuiles), jamais deux fois envoyé.
      if (!byOsmId.has(feature.properties.osmId)) byOsmId.set(feature.properties.osmId, feature);
    }
  });

  if (servedTiles.length === 0) {
    throw new OverpassUnavailableError("Toutes les tuiles demandées ont échoué.");
  }

  return {
    status: "ok",
    degraded,
    truncated,
    tiles: servedTiles,
    attribution: MAP_ATTRIBUTION_TEXT,
    trails: [...byOsmId.values()],
  };
}

function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
