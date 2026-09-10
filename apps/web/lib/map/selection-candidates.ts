/**
 * Ordre des candidats sous le viseur clavier / le point de tap — ADR-018, lot L3 ;
 * `docs/design-carte.md` §5.4.1 : « ensemble de candidats… ordre de parcours DÉTERMINISTE : 1. les
 * itinéraires nommés d'abord ; 2. puis par distance croissante du centre du viseur à la géométrie
 * rendue ; 3. à égalité, par `osmId` croissant. Le même ordre régit le choix au tap. »
 *
 * Pur : la distance en pixels écran (`distancePx`) est calculée par l'appelant via
 * `map.project()` + `geometry.ts` — ce module ne connaît pas MapLibre.
 */

export interface SelectionCandidate {
  osmId: string;
  isNamedRoute: boolean;
  /** Distance du point visé (viseur ou tap) à la géométrie rendue, en pixels écran. */
  distancePx: number;
}

/** §5.4.1 — tri déterministe : itinéraires nommés d'abord, puis distance croissante, puis `osmId`. */
export function orderSelectionCandidates(candidates: readonly SelectionCandidate[]): SelectionCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.isNamedRoute !== b.isNamedRoute) return a.isNamedRoute ? -1 : 1;
    if (a.distancePx !== b.distancePx) return a.distancePx - b.distancePx;
    return a.osmId < b.osmId ? -1 : a.osmId > b.osmId ? 1 : 0;
  });
}

/**
 * §5.4.1 — touches `N` / `P` : passer au tracé suivant/précédent parmi les candidats sous le
 * viseur. `currentOsmId` absent de l'ensemble (le viseur a bougé) ⟹ repart du premier/dernier,
 * jamais une exception silencieuse.
 */
export function cycleSelectionCandidate(
  ordered: readonly SelectionCandidate[],
  currentOsmId: string | null,
  direction: 1 | -1,
): SelectionCandidate | null {
  if (ordered.length === 0) return null;

  const index = currentOsmId === null ? -1 : ordered.findIndex((candidate) => candidate.osmId === currentOsmId);
  if (index === -1) return direction === 1 ? ordered[0] : ordered[ordered.length - 1];

  const nextIndex = (index + direction + ordered.length) % ordered.length;
  return ordered[nextIndex];
}
