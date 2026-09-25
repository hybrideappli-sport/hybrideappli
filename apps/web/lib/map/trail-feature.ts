/**
 * Traitement PUR des éléments Overpass BRUTS (ADR-018 §4.4, lot L2) — élagage de tags à la liste
 * blanche, construction de la géométrie GeoJSON, simplification (Douglas–Peucker). Aucun I/O :
 * c'est ce que `trails-cache.ts` place derrière `unstable_cache`, donc ce qui compose le VOLUME de
 * l'entrée N3 (ADR-018 §4.4 : « le volume devient la contrainte serrante »).
 *
 * PAS de classement ici (`classifySports()` vit dans `@hybride/domain`, appliqué APRÈS lecture du
 * cache, à chaque requête — ADR-018 §4.1/§4.3) : ce module ne connaît même pas l'existence des 4
 * sports.
 */
import type { OsmTags } from "@hybride/domain";

import { SIMPLIFY_TOLERANCE_M } from "./constants";
import { OVERPASS_TAG_WHITELIST } from "./overpass-query";
import type { OverpassRawElement, OverpassRelation, OverpassWay } from "./overpass-types";

export interface PreparedTileElement {
  /** `'way/1234567'` | `'relation/98765'`. */
  osmId: string;
  /** Déjà élagués à `OVERPASS_TAG_WHITELIST`. */
  tags: OsmTags;
  geometry: { type: "LineString"; coordinates: [number, number][] } | { type: "MultiLineString"; coordinates: [number, number][][] };
}

const TAG_WHITELIST_SET = new Set<string>(OVERPASS_TAG_WHITELIST);

/** Ne garde que les tags de la liste blanche (§5.5) — le reste est jeté avant mise en cache. */
export function elagageTags(tags: Record<string, string> | undefined): OsmTags {
  if (!tags) return {};
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (TAG_WHITELIST_SET.has(key)) kept[key] = value;
  }
  return kept;
}

const EARTH_RADIUS_M = 6_371_000;

/** Distance orthodromique (haversine), en mètres, entre deux points `[lon, lat]`. */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Projection équirectangulaire locale (mètres), suffisante pour une distance perpendiculaire à ~5 m près. */
function projectLocalMeters(point: [number, number], referenceLat: number): [number, number] {
  const [lon, lat] = point;
  const cosRef = Math.cos((referenceLat * Math.PI) / 180);
  return [((lon * Math.PI) / 180) * EARTH_RADIUS_M * cosRef, ((lat * Math.PI) / 180) * EARTH_RADIUS_M];
}

function perpendicularDistanceMeters(point: [number, number], start: [number, number], end: [number, number]): number {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - sx, py - sy);
  const t = ((px - sx) * dx + (py - sy) * dy) / lengthSquared;
  const clampedT = Math.max(0, Math.min(1, t));
  const projX = sx + clampedT * dx;
  const projY = sy + clampedT * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Simplifie une ligne `[lon, lat][]` (Douglas–Peucker, `SIMPLIFY_TOLERANCE_M` par défaut) — les
 * coordonnées d'ORIGINE sont conservées pour les points retenus (aucune distorsion introduite), la
 * distance perpendiculaire est calculée sur une projection locale en mètres.
 */
export function simplifyLine(points: [number, number][], toleranceMeters: number = SIMPLIFY_TOLERANCE_M): [number, number][] {
  if (points.length <= 2) return points;
  const referenceLat = points[0][1];
  const projected = points.map((point) => projectLocalMeters(point, referenceLat));

  // Douglas-Peucker sur les indices projetés, puis on ré-hydrate avec les coordonnées d'origine.
  const keptIndices = douglasPeuckerIndices(projected, toleranceMeters);
  return keptIndices.map((index) => points[index]);
}

function douglasPeuckerIndices(points: [number, number][], toleranceMeters: number): number[] {
  function recurse(startIdx: number, endIdx: number): number[] {
    if (endIdx - startIdx < 2) return [startIdx, endIdx];

    let maxDistance = 0;
    let maxIndex = startIdx;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const distance = perpendicularDistanceMeters(points[i], points[startIdx], points[endIdx]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxDistance <= toleranceMeters) return [startIdx, endIdx];

    const left = recurse(startIdx, maxIndex);
    const right = recurse(maxIndex, endIdx);
    return [...left.slice(0, -1), ...right];
  }

  return recurse(0, points.length - 1);
}

function geometryPointsToLine(geometry: Array<{ lat: number; lon: number } | null> | undefined): [number, number][] | null {
  if (!geometry) return null;
  const points: [number, number][] = [];
  for (const point of geometry) {
    if (point) points.push([point.lon, point.lat]);
  }
  return points.length >= 2 ? points : null;
}

function buildGeometryFromWay(way: OverpassWay): PreparedTileElement["geometry"] | null {
  const line = geometryPointsToLine(way.geometry);
  if (!line) return null;
  return { type: "LineString", coordinates: simplifyLine(line) };
}

function buildGeometryFromRelation(relation: OverpassRelation): PreparedTileElement["geometry"] | null {
  const lines: [number, number][][] = [];
  for (const member of relation.members ?? []) {
    if (member.type !== "way") continue; // seuls les membres `way` portent une géométrie de ligne exploitable.
    const line = geometryPointsToLine(member.geometry);
    if (line) lines.push(simplifyLine(line));
  }
  return lines.length > 0 ? { type: "MultiLineString", coordinates: lines } : null;
}

/**
 * Élague les tags et construit la géométrie (simplifiée) de chaque way/relation BRUT — c'est le
 * résultat de cette fonction qui est mis en cache par `trails-cache.ts` (données « brutes » au sens
 * de l'ADR : élaguées et simplifiées, mais PAS classées). Un élément sans géométrie exploitable
 * (way de moins de 2 points, relation sans membre `way` exploitable) est écarté.
 */
export function prepareTileElements(rawElements: OverpassRawElement[]): PreparedTileElement[] {
  const prepared: PreparedTileElement[] = [];
  for (const element of rawElements) {
    if (element.type === "way") {
      const geometry = buildGeometryFromWay(element);
      if (!geometry) continue;
      prepared.push({ osmId: `way/${element.id}`, tags: elagageTags(element.tags), geometry });
    } else {
      const geometry = buildGeometryFromRelation(element);
      if (!geometry) continue;
      prepared.push({ osmId: `relation/${element.id}`, tags: elagageTags(element.tags), geometry });
    }
  }
  return prepared;
}
