/**
 * Gabarit Overpass QL (ADR-018 §5.5, §4.4) — fonction PURE, AUCUNE URL, aucun I/O : c'est
 * `overpass-client.ts` (`server-only`) qui envoie effectivement cette requête. Séparé pour rester
 * testable indépendamment du réseau.
 *
 * `OVERPASS_QUERY_VERSION` change SEULEMENT si le TEXTE de cette requête change (périmètre
 * `highway`/`route`, tags whitelistés) OU si un paramètre qui détermine le contenu mis en cache
 * change (`SIMPLIFY_TOLERANCE_M`, `lib/map/constants.ts`) — coûteux, rare. C'est DIFFÉRENT de
 * `CLASSIFIER_VERSION` (`@hybride/domain`), qui ne doit JAMAIS entrer dans la clé de cache
 * (`trails-cache.ts`) : régler le classement ne coûte aucun appel Overpass (ADR-018 §4.1).
 */

import type { BoundingBox, TileCoord } from "./tile-grid";
import { tileBounds } from "./tile-grid";

/** Bump UNIQUEMENT si le texte de la requête change. */
export const OVERPASS_QUERY_VERSION = "1";

/** Politique d'usage des serveurs Overpass publics : timeout explicite dans la requête elle-même. */
export const OVERPASS_TIMEOUT_SECONDS = 25;

/** §5.5 — voies DÉDIÉES revêtues/non revêtues, hors voirie ordinaire (déjà dessinée par le fond de carte). */
export const OVERPASS_HIGHWAY_VALUES = ["path", "footway", "cycleway", "bridleway", "track", "pedestrian"] as const;

/** §5.5 — relations d'itinéraire : les seuls objets OSM qui portent de façon fiable un nom et une distance. */
export const OVERPASS_ROUTE_VALUES = ["hiking", "foot", "running", "bicycle"] as const;

/**
 * §5.5 — liste blanche DÉLIBÉRÉMENT généreuse (contrepartie assumée de §4.1) : on paie quelques
 * octets par chemin pour que le réglage du classement (`CLASSIFIER_VERSION`) reste gratuit.
 */
export const OVERPASS_TAG_WHITELIST = [
  "name",
  "highway",
  "surface",
  "tracktype",
  "smoothness",
  "sac_scale",
  "mtb:scale",
  "trail_visibility",
  "width",
  "foot",
  "bicycle",
  "horse",
  "access",
  "incline",
  "ascent",
  "distance",
  "route",
  "network",
  "ref",
  "operator",
  "sport",
  "segregated",
  "lit",
  "oneway",
] as const;

/** Overpass attend `(sud,ouest,nord,est)` = `(minLat,minLon,maxLat,maxLon)` — PAS l'ordre GeoJSON. */
function formatOverpassBbox(bounds: BoundingBox): string {
  return `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;
}

/**
 * `out tags geom;` : renvoie tags + géométrie complète (nœuds résolus) directement sur chaque
 * way/relation, sans recursion explicite (`>;`/`out skel qt;`) — évite une seconde passe et un
 * second aller-retour réseau pour la même tuile.
 */
export function buildOverpassQuery(tile: TileCoord): string {
  const bbox = formatOverpassBbox(tileBounds(tile));
  const highwayPattern = OVERPASS_HIGHWAY_VALUES.join("|");
  const routePattern = OVERPASS_ROUTE_VALUES.join("|");
  return [
    `[out:json][timeout:${OVERPASS_TIMEOUT_SECONDS}];`,
    "(",
    `  way["highway"~"^(${highwayPattern})$"]["access"!~"^(private|no)$"](${bbox});`,
    `  relation["type"="route"]["route"~"^(${routePattern})$"](${bbox});`,
    ");",
    "out tags geom;",
  ].join("\n");
}
