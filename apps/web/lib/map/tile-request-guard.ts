/**
 * Plafond de tuiles par session (ADR-018, question ouverte n°2, 3ᵉ levier — le seul point par
 * lequel passent TOUTES les requêtes de tuiles côté client, `transformRequest` de MapLibre).
 *
 * Limite honnête, assumée dans l'ADR : c'est du code client, contournable par un utilisateur
 * déterminé. La menace visée est l'emballement INVOLONTAIRE (panoramique/zoom en boucle), pas
 * l'attaque — voir `MAP_MAX_TILES_PER_SESSION` (`lib/map/constants.ts`).
 *
 * Au-delà du plafond, les requêtes de tuiles sont réécrites vers un pixel transparent : la requête
 * ne part JAMAIS vers le CDN Stadia (c'est bien le budget qu'on protège), et MapLibre ne lève pas
 * d'erreur réseau visible — le fond « gèle », les tracés déjà chargés (L2+) restent lisibles.
 *
 * Fonction PURE (aucun DOM, aucune dépendance à `maplibre-gl`) : testée indépendamment du composant
 * qui la câble à `transformRequest` (`components/map/map-canvas.tsx`).
 */

/** PNG 1×1 transparent — évite un 404/erreur réseau bruyante pour la tuile refusée. */
export const TRANSPARENT_TILE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export interface TileRequestGuardResult {
  url: string;
}

export type TileRequestGuard = (url: string, resourceType?: string) => TileRequestGuardResult;

/**
 * `onCapReached` est appelé UNE SEULE FOIS, au moment exact où le plafond est franchi — c'est le
 * point d'accroche pour déclencher l'état UI explicite (`map-tile-cap-reached`), jamais un
 * gel silencieux.
 */
export function createTileRequestGuard(maxTilesPerSession: number, onCapReached: () => void): TileRequestGuard {
  let tileCount = 0;
  let notified = false;

  return (url, resourceType) => {
    if (resourceType !== "Tile") return { url };

    if (tileCount >= maxTilesPerSession) {
      if (!notified) {
        notified = true;
        onCapReached();
      }
      return { url: TRANSPARENT_TILE_DATA_URL };
    }

    tileCount += 1;
    return { url };
  };
}
