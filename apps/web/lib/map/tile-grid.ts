/**
 * Grille de tuiles slippy WebMercator (ADR-018 §4.2, lot L2) — L'ARRONDI DE LA BBOX EST UN
 * INVARIANT SERVEUR : le client envoie sa bbox de viewport, c'est CE module qui la projette sur la
 * grille de tuiles au zoom `TILE_ZOOM`, jamais l'inverse. Impossible à contourner en fabriquant une
 * requête à la main (§3).
 *
 * Fonctions PURES, 0 I/O — testées indépendamment de toute route HTTP et de tout appel Overpass.
 */

/** ADR-018 §4.2 — grille absolue (≈ 9,8 × 6,9 km à 45° de latitude), à réévaluer sur données réelles
 * au point de validation de fin de L2. */
export const TILE_ZOOM = 12;

/** ADR-018 §4.4 — au-delà, `status: 'zoom_required'` : jamais une requête Overpass sur un continent. */
export const MAX_TILES_PER_REQUEST = 9;

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function tileKey(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom);
}

function tileXToLon(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Bornes `{minLon, minLat, maxLon, maxLat}` d'UNE tuile — sert à fabriquer la requête Overpass
 * qui lui est propre (`lib/map/overpass-query.ts`, §5.5). */
export function tileBounds(tile: TileCoord): BoundingBox {
  return {
    minLon: tileXToLon(tile.x, tile.z),
    maxLon: tileXToLon(tile.x + 1, tile.z),
    minLat: tileYToLat(tile.y + 1, tile.z),
    maxLat: tileYToLat(tile.y, tile.z),
  };
}

/**
 * `bbox` reçue du client, projetée sur les tuiles `TILE_ZOOM` qu'elle recouvre. Tableau vide si la
 * `bbox` est dégénérée (min ≥ max sur un axe) — l'appelant la traite alors comme `zoom_required`,
 * jamais comme une erreur de validation distincte (ADR-018 §4.4 : « une impossibilité expliquée
 * n'est pas une panne »).
 */
export function tilesForBbox(bbox: BoundingBox, zoom: number = TILE_ZOOM): TileCoord[] {
  if (bbox.minLon >= bbox.maxLon || bbox.minLat >= bbox.maxLat) return [];

  const minX = lonToTileX(bbox.minLon, zoom);
  const maxX = lonToTileX(bbox.maxLon, zoom);
  // Latitude et index Y sont en sens inverse (Y croît vers le sud) : maxLat -> minY, minLat -> maxY.
  const minY = latToTileY(bbox.maxLat, zoom);
  const maxY = latToTileY(bbox.minLat, zoom);

  const tiles: TileCoord[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ z: zoom, x, y });
    }
  }
  return tiles;
}

/**
 * Parse `?bbox=minLon,minLat,maxLon,maxLat` — `null` si malformée (nombre de composantes,
 * valeurs non numériques, hors des bornes géographiques, ou dégénérée). Le serveur ne fait JAMAIS
 * confiance à la taille du viewport envoyée par le client — seule la LISTE de tuiles qui en résulte
 * compte ensuite (§4.2).
 */
export function parseBboxParam(raw: string): BoundingBox | null {
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) return null;

  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLon >= maxLon || minLat >= maxLat) return null;

  return { minLon, minLat, maxLon, maxLat };
}
