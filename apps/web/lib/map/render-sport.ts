/**
 * Règle de teinte d'un chemin multi-sports — ADR-018, lot L3 ; `docs/design-carte.md` §3
 * (« Livrable 2 ») et §5.7.2 (discriminant itinéraire nommé).
 *
 * Deux propriétés PURES, calculées CÔTÉ CLIENT, recalculées ensemble et poussées par un unique
 * `source.setData()` (§3.1, §5.7.2, §9.2 dernier paragraphe). Aucune des deux n'existe dans
 * `MapTrailProperties` (`@hybride/domain`) : le contrat d'ADR-018 §6 n'est pas modifié.
 */
import type { MapSport, MapTrailFeature } from "@hybride/domain";

/**
 * §3.1 — priorité fixe entre sports, évaluée sur les seuls filtres ACTIFS (§3.2 : « sur les filtres
 * actifs », pas sur `sports` brut). Du plus prioritaire au moins prioritaire.
 */
export const SPORT_RENDER_PRIORITY: readonly MapSport[] = ["bike", "trail", "route", "hike"];

/**
 * Le tracé est dessiné une seule fois, dans la teinte/le motif du premier sport de
 * `SPORT_RENDER_PRIORITY` qui est À LA FOIS porté par le tracé ET actif dans les pastilles.
 * `null` ⟹ le tracé n'est rendu par aucune couche (aucun de ses sports n'est actif).
 */
export function pickRenderSport(sports: readonly MapSport[], activeFilters: ReadonlySet<MapSport>): MapSport | null {
  for (const sport of SPORT_RENDER_PRIORITY) {
    if (activeFilters.has(sport) && sports.includes(sport)) return sport;
  }
  return null;
}

/**
 * §5.7.2 — `osmId` a déjà la forme `'way/1234567' | 'relation/98765'` (ADR-018 §6) : la relation
 * est identifiable sans ajouter le moindre champ à `MapTrailProperties`. Un segment nommé n'est
 * PAS promu (§5.7.2 : « seules les relations le sont ») — c'est la rareté qui fait fonctionner
 * l'épaisseur.
 */
export function isNamedRoute(feature: Pick<MapTrailFeature, "properties">): boolean {
  return feature.properties.osmId.startsWith("relation/") && feature.properties.name !== null;
}
