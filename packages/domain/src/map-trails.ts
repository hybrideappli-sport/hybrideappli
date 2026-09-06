/**
 * ADR-018 (Carte des tracés outdoor) §5 (classement des 4 sports) et §6 (contrat de la route
 * `GET /api/v1/map/trails`), lot L2.
 *
 * `classifySports()` est une fonction PURE (0 I/O, déterministe) : c'est la SEULE porte d'entrée du
 * mapping tag OSM → sport. Elle vit dans `@hybride/domain`, PAS dans `@hybride/rules-engine` — le
 * précédent est explicite (ADR-016 §5) : le moteur n'accueille du code applicatif que lorsqu'il
 * doit REVÉRIFIER un garde-fou de sécurité. Classer un sentier n'en est pas un : aucune borne de
 * charge, aucune donnée de santé, aucune conséquence sur un plan. `@hybride/domain` la rend par
 * ailleurs partageable avec l'import GPX de la phase 2, qui aura le même besoin.
 *
 * `CLASSIFIER_VERSION` est délibérément SÉPARÉE de `OVERPASS_QUERY_VERSION`
 * (`apps/web/lib/map/overpass-query.ts`) : seule la seconde entre dans la clé du Data Cache Next.js
 * (`unstable_cache`, `apps/web/lib/map/trails-cache.ts`, §4.1). Bumper `CLASSIFIER_VERSION` ne
 * déclenche JAMAIS un appel Overpass — c'est tout l'intérêt de l'arbitrage retenu par l'ADR.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Les 4 sports (§5.3)
// ---------------------------------------------------------------------------

export const MAP_SPORTS = ["route", "trail", "hike", "bike"] as const;
export type MapSport = (typeof MAP_SPORTS)[number];
export const MapSportSchema = z.enum(MAP_SPORTS);

/** Bump à chaque réglage du classement (seuils de largeur, traitement d'un `surface` absent…) —
 * coût Overpass NUL par construction (§4.1). Ne PAS confondre avec `OVERPASS_QUERY_VERSION`. */
export const CLASSIFIER_VERSION = "1.0.0";

/**
 * Sac de tags OSM déjà élagué à la liste blanche (`OVERPASS_TAG_WHITELIST`,
 * `apps/web/lib/map/overpass-query.ts`). Valeurs toujours des chaînes brutes OSM — jamais typées
 * plus fort, OSM ne garantissant aucune énumération fermée.
 */
export type OsmTags = Readonly<Record<string, string | undefined>>;

// ---------------------------------------------------------------------------
// Prédicats dérivés (§5.2) — les seuils exacts sont ICI, pas dans le code appelant.
// ---------------------------------------------------------------------------

const PAVED_SURFACES = new Set([
  "asphalt",
  "chipseal",
  "concrete",
  "concrete:plates",
  "concrete:lanes",
  "paved",
  "paving_stones",
  "sett",
]);

const TECHNICAL_SAC_SCALES = new Set(["demanding_mountain_hiking", "alpine_hiking", "demanding_alpine_hiking", "difficult_alpine_hiking"]);
const TECHNICAL_TRAIL_VISIBILITIES = new Set(["bad", "horrible", "no"]);
const TECHNICAL_SMOOTHNESS = new Set(["very_bad", "horrible", "very_horrible", "impassable"]);

/** §5.2 « étroit » — track est volontairement ABSENT : un chemin large reste large même étroit en largeur déclarée. */
const NARROW_HIGHWAYS = new Set(["path", "footway", "bridleway"]);
const FOOT_IMPLIED_HIGHWAYS = new Set(["path", "footway", "pedestrian", "track", "bridleway"]);
const ACCESS_ALLOWED_VALUES = new Set(["yes", "designated", "permissive"]);

/** §5.5 — relations d'itinéraire : classement DIRECT par le tag `route`, indépendant de tout
 * prédicat de surface/largeur (ces relations n'en portent pas de façon fiable). */
const ROUTE_RELATION_MAPPING: Readonly<Record<string, MapSport>> = {
  running: "route",
  hiking: "hike",
  foot: "hike",
  bicycle: "bike",
};

/** Extrait le premier nombre d'une chaîne OSM (`"1.5"`, `"1,5"`, `"150 cm"`…), en mètres. */
function parseMeters(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /-?\d+(?:[.,]\d+)?/.exec(raw);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  if (Number.isNaN(value)) return null;
  return /cm\b/.test(raw) ? value / 100 : value;
}

/** `mtb:scale` OSM va de `0` à `6`, parfois avec un suffixe (`"2+"`) — on ne garde que l'entier de tête. */
function parseMtbScale(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /^\s*(\d+)/.exec(raw);
  return match ? Number(match[1]) : null;
}

/**
 * `true` = revêtu, `false` = non revêtu — toujours déterminé (jamais `null`), la présomption
 * couvrant exhaustivement les 6 valeurs de `highway` retenues à l'extraction (§5.5). Le revêtement
 * PRÉSUMÉ sert au classement, jamais à l'affichage (`surfaceInferred`, §6).
 */
function isSurfaced(tags: OsmTags): boolean {
  if (tags.surface !== undefined) return PAVED_SURFACES.has(tags.surface);
  switch (tags.highway) {
    case "cycleway":
    case "footway":
    case "pedestrian":
      return true;
    case "path":
    case "bridleway":
      return false;
    case "track":
      return tags.tracktype === "grade1";
    default:
      // Hors périmètre de l'extraction (§5.5 restreint `highway` à 6 valeurs) — non revêtu par
      // défaut, jamais atteint en pratique sur des tags produits par `overpass-query.ts`.
      return false;
  }
}

function isNarrow(tags: OsmTags): boolean {
  if (!tags.highway || !NARROW_HIGHWAYS.has(tags.highway)) return false;
  const width = parseMeters(tags.width);
  return width === null || width <= 2;
}

function isTechnical(tags: OsmTags): boolean {
  if (tags.sac_scale && TECHNICAL_SAC_SCALES.has(tags.sac_scale)) return true;
  const mtbScale = parseMtbScale(tags["mtb:scale"]);
  if (mtbScale !== null && mtbScale >= 2) return true;
  if (tags.trail_visibility && TECHNICAL_TRAIL_VISIBILITIES.has(tags.trail_visibility)) return true;
  if (tags.smoothness && TECHNICAL_SMOOTHNESS.has(tags.smoothness)) return true;
  return false;
}

function isFootAllowed(tags: OsmTags): boolean {
  if (tags.foot === "no") return false;
  if (tags.foot && ACCESS_ALLOWED_VALUES.has(tags.foot)) return true;
  return Boolean(tags.highway && FOOT_IMPLIED_HIGHWAYS.has(tags.highway));
}

function isBikeAllowed(tags: OsmTags): boolean {
  if (tags.bicycle === "no") return false;
  if (tags.bicycle && ACCESS_ALLOWED_VALUES.has(tags.bicycle)) return true;
  return tags.highway === "cycleway";
}

function classifyRouteRelation(routeTag: string): MapSport[] {
  const sport = ROUTE_RELATION_MAPPING[routeTag];
  return sport ? [sport] : [];
}

/**
 * §5.3 — Le chevauchement est VOULU (§5.4) : `Trail ⊂ Rando` par construction, `Route ∩ Vélo`
 * fréquent (voies vertes/berges asphaltées ouvertes aux piétons ET aux vélos). Retourne toujours
 * dans l'ordre stable de `MAP_SPORTS`, pour un rendu déterministe côté client (L3, priorité fixe).
 *
 * Tableau vide ⟹ le chemin n'est retenu par AUCUN filtre : il est écarté avant plafonnement
 * (§4.4) et n'est JAMAIS envoyé au client.
 */
export function classifySports(tags: OsmTags): MapSport[] {
  if (!tags.highway && tags.route) return classifyRouteRelation(tags.route);
  if (!tags.highway) return [];

  const surfaced = isSurfaced(tags);
  const narrow = isNarrow(tags);
  const technical = isTechnical(tags);
  const footAllowed = isFootAllowed(tags);
  const bikeAllowed = isBikeAllowed(tags);

  const sports = new Set<MapSport>();
  if (footAllowed && surfaced && !technical) sports.add("route");
  if (footAllowed && !surfaced && narrow) sports.add("trail");
  if (footAllowed && !surfaced) sports.add("hike");
  if (bikeAllowed && (tags.highway === "cycleway" || surfaced)) sports.add("bike");

  return MAP_SPORTS.filter((sport) => sports.has(sport));
}

// ---------------------------------------------------------------------------
// Contrat HTTP — `GET /api/v1/map/trails` (§6). Lecture seule STRICTE : AUCUN champ de plan, AUCUN
// identifiant utilisateur, AUCUN `planned_session_id`, AUCUNE date — même patron que
// `PlacementDecision` (ADR-016 §5) : une propriété de TYPE, vérifiée par le compilateur ET par
// `packages/domain/src/__tests__/map-trails-no-plan-fields.test.ts`, pas une vigilance de relecture.
// ---------------------------------------------------------------------------

export interface MapTrailProperties {
  /** `'way/1234567'` | `'relation/98765'` — identité OSM stable. */
  osmId: string;
  /** 1 à 4 valeurs — le chevauchement est porté ici (§5.4). */
  sports: MapSport[];
  name: string | null;
  distanceKm: number | null;
  /** TOUJOURS `null` en phase 1 (§6) — OSM ne porte pas le dénivelé de façon fiable ; nécessite
   * l'Elevation API de Stadia (lot L4, conditionnel). */
  elevationGainM: null;
  /** `null` si `surfaceInferred` — jamais la valeur PRÉSUMÉE : on ne fabrique pas une donnée
   * qu'OSM ne porte pas (§5.2). */
  surface: string | null;
  surfaceInferred: boolean;
  /** Lien de vérification — exigence de traçabilité ODbL. */
  osmUrl: string;
}

export type MapTrailGeometry =
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "MultiLineString"; coordinates: [number, number][][] };

export interface MapTrailFeature {
  type: "Feature";
  geometry: MapTrailGeometry;
  properties: MapTrailProperties;
}

export const MapTrailsResponseStatusSchema = z.enum(["ok", "zoom_required"]);
export type MapTrailsResponseStatus = z.infer<typeof MapTrailsResponseStatusSchema>;

export interface MapTrailsResponse {
  status: MapTrailsResponseStatus;
  /** Au moins une tuile n'a pas pu être rafraîchie (Overpass indisponible, `429`, timeout). */
  degraded: boolean;
  /** Plafond `MAX_FEATURES_PER_TILE` atteint sur au moins une tuile. */
  truncated: boolean;
  /** `'12/2062/1408'` — tuiles EFFECTIVEMENT servies. */
  tiles: string[];
  attribution: string;
  trails: MapTrailFeature[];
}

/**
 * `?bbox=minLon,minLat,maxLon,maxLat` — chaîne brute côté contrat. La conversion numérique, la
 * validation des bornes géographiques et l'ARRONDI SUR LA GRILLE DE TUILES vivent dans
 * `apps/web/lib/map/tile-grid.ts` : c'est un invariant SERVEUR, jamais contournable par le client
 * (ADR-018 §3). Il n'y a PAS de paramètre `sports` (§6) : le filtrage est 100 % client (lot L3).
 */
export const MapTrailsQuerySchema = z.object({
  bbox: z.string().min(1, "`bbox` est requis."),
});
export type MapTrailsQuery = z.infer<typeof MapTrailsQuerySchema>;
