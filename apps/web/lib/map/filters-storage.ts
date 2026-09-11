/**
 * Persistance des pastilles de filtre — ADR-018, lot L3 ; `docs/design-carte.md` §4.3.
 *
 * `localStorage`, clé `hybride.map.filters`. Aucun stockage serveur (ADR-018 §7 : rien n'est
 * écrit). État initial : les quatre actifs. Zéro filtre actif est un état AUTORISÉ (§4.3 : « ne
 * jamais désactiver la dernière pastille »).
 *
 * Pur vis-à-vis de `Storage` (interface DOM injectée, jamais lu/écrit directement ici) : testable
 * sans `jsdom`, avec un faux `Storage` en mémoire.
 */
import { MAP_SPORTS, type MapSport } from "@hybride/domain";

export const MAP_FILTERS_STORAGE_KEY = "hybride.map.filters";

/** §4.3 — état initial : les quatre actifs. */
export function defaultActiveFilters(): Set<MapSport> {
  return new Set(MAP_SPORTS);
}

function isMapSport(value: unknown): value is MapSport {
  return typeof value === "string" && (MAP_SPORTS as readonly string[]).includes(value);
}

/** Lecture défensive : toute valeur stockée invalide (JSON corrompu, tableau hétérogène, storage
 * indisponible en navigation privée…) retombe sur l'état initial plutôt que de faire échouer l'écran. */
export function loadActiveFilters(storage: Pick<Storage, "getItem">): Set<MapSport> {
  try {
    const raw = storage.getItem(MAP_FILTERS_STORAGE_KEY);
    if (raw === null) return defaultActiveFilters();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultActiveFilters();
    return new Set(parsed.filter(isMapSport));
  } catch {
    return defaultActiveFilters();
  }
}

export function saveActiveFilters(storage: Pick<Storage, "setItem">, filters: ReadonlySet<MapSport>): void {
  try {
    storage.setItem(MAP_FILTERS_STORAGE_KEY, JSON.stringify([...filters]));
  } catch {
    // Storage indisponible (navigation privée, quota) : le filtre reste actif pour la session en
    // cours, simplement pas persisté — jamais une exception qui casse l'écran (§4.3 n'exige que la
    // persistance, pas sa réussite garantie).
  }
}

/** §4.3 — sélection multiple et indépendante (`aria-pressed`), zéro actif autorisé. */
export function toggleActiveFilter(filters: ReadonlySet<MapSport>, sport: MapSport): Set<MapSport> {
  const next = new Set(filters);
  if (next.has(sport)) next.delete(sport);
  else next.add(sport);
  return next;
}
