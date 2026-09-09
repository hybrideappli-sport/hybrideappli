/**
 * Debounce générique — ADR-018, question ouverte n°2, **levier de premier rang** contre
 * l'emballement de consommation Stadia : « ne déclencher le rafraîchissement qu'à la
 * STABILISATION de la vue (`moveend`/`zoomend` débouncés), jamais pendant le geste ».
 *
 * `moveend`/`zoomend` de MapLibre ne se déclenchent déjà qu'à la fin d'un geste, mais une série de
 * gestes rapprochés (petits panoramiques successifs) produit une rafale de `moveend` tout aussi
 * proche : ce debounce absorbe cette rafale en une seule recomputation, à la fin de la série.
 *
 * Implémentation minimale, sans dépendance — pas de `lodash.debounce` pour une fonction de 8 lignes.
 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...args);
    }, delayMs);
  };
}
