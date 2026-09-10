/**
 * Géométrie 2D minimale, agnostique de l'unité (mètres ou pixels écran selon l'appelant) — utilisée
 * par `selection-candidates.ts` (ADR-018, lot L3, `docs/design-carte.md` §5.4.1) pour classer les
 * tracés candidats sous le viseur/le point de tap par distance croissante à leur géométrie.
 *
 * Distincte de `haversineMeters`/`perpendicularDistanceMeters` de `trail-feature.ts`, qui opèrent
 * spécifiquement sur des coordonnées `[lon, lat]` géographiques (projection locale incluse) : ici
 * les points sont déjà dans le même espace euclidien (coordonnées écran, `map.project()`).
 */

export function distancePointToPoint(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function distancePointToSegment(point: readonly [number, number], start: readonly [number, number], end: readonly [number, number]): number {
  const [px, py] = point;
  const [sx, sy] = start;
  const [ex, ey] = end;
  const dx = ex - sx;
  const dy = ey - sy;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distancePointToPoint(point, start);
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared));
  return distancePointToPoint(point, [sx + t * dx, sy + t * dy]);
}

/** Distance minimale d'un point à une polyligne (0 point ⟹ `Infinity`, 1 point ⟹ distance au point). */
export function distancePointToPolyline(point: readonly [number, number], line: readonly (readonly [number, number])[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return distancePointToPoint(point, line[0]);
  let min = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    const distance = distancePointToSegment(point, line[i - 1], line[i]);
    if (distance < min) min = distance;
  }
  return min;
}

/** Distance minimale d'un point à un ensemble de polylignes (`MultiLineString`). */
export function distancePointToPolylines(point: readonly [number, number], lines: readonly (readonly (readonly [number, number])[])[]): number {
  let min = Infinity;
  for (const line of lines) {
    const distance = distancePointToPolyline(point, line);
    if (distance < min) min = distance;
  }
  return min;
}
