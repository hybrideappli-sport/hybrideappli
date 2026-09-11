/**
 * États d'écran et annonces `aria-live` dérivés des tracés chargés/filtrés — ADR-018, lot L3 ;
 * `docs/design-carte.md` §3.5 (décompte), §7 (les trois cas distincts d'« aucun résultat »), §8.
 *
 * Pur : ne dépend d'aucun composant, d'aucune instance MapLibre. Les composants
 * (`map-empty-state.tsx`, `map-canvas.tsx`) ne font que rendre les constantes et fonctions d'ici.
 */
import type { MapSport } from "@hybride/domain";

import { SPORT_RENDER_PRIORITY } from "./render-sport";
import { SPORT_LABELS_FR } from "./trail-selection-format";
import type { TrailRenderFeatureCollection } from "./trail-render-source";
import { countRenderedBySport, countRenderedNamedRoutes } from "./trail-render-source";

/** Séparateur de milliers — espace insécable FINE (§7.3 : « formaté avec une espace insécable fine
 * comme séparateur de milliers, les volumes mesurés étant à quatre chiffres »). */
export function formatCountFr(value: number): string {
  const digits = Math.max(0, Math.trunc(value)).toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * §3.5 point 2 — « 1 240 tracés affichés : 480 Vélo, 390 Trail, 370 Rando, dont 3 itinéraires
 * balisés. » Équivalent non visuel de la légende : seuls les sports EFFECTIVEMENT rendus (compte
 * > 0) apparaissent, dans l'ordre de priorité de §3.1.
 */
export function buildCountAnnouncement(collection: TrailRenderFeatureCollection): string {
  const bySport = countRenderedBySport(collection);
  const total = Object.values(bySport).reduce((sum, count) => sum + count, 0);
  if (total === 0) return "Aucun tracé affiché.";

  const bySportText = SPORT_RENDER_PRIORITY.filter((sport) => bySport[sport] > 0)
    .map((sport: MapSport) => `${formatCountFr(bySport[sport])} ${SPORT_LABELS_FR[sport]}`)
    .join(", ");

  const namedRoutes = countRenderedNamedRoutes(collection);
  const namedRoutesSuffix = namedRoutes > 0 ? `, dont ${namedRoutes} itinéraire${namedRoutes > 1 ? "s" : ""} balisé${namedRoutes > 1 ? "s" : ""}` : "";

  return `${formatCountFr(total)} tracés affichés : ${bySportText}${namedRoutesSuffix}.`;
}

/** §7.3 — les TROIS cas distincts d'« aucun résultat », à ne jamais confondre. */
export type EmptyStateKind = "zone-not-mapped" | "filtered-out" | "no-filter-active";

export interface DeriveEmptyStateInput {
  /** `trails.length` de la réponse API — AVANT filtrage client. */
  rawTrailsCount: number;
  /** Tracés effectivement rendus après filtrage client (`renderSport` non nul). */
  renderedCount: number;
  activeFilterCount: number;
}

/**
 * `null` ⟹ pas un état vide (au moins un tracé rendu). Le cas (c) « aucun filtre actif » est
 * vérifié EN PREMIER : à zéro filtre actif, `renderedCount` est nécessairement nul lui aussi, mais
 * c'est un état distinct avec son propre message (§7.3).
 */
export function deriveEmptyState(input: DeriveEmptyStateInput): EmptyStateKind | null {
  if (input.renderedCount > 0) return null;
  if (input.activeFilterCount === 0) return "no-filter-active";
  if (input.rawTrailsCount === 0) return "zone-not-mapped";
  return "filtered-out";
}

/** Copie exacte de §7.3 (gabarit B), pour que le composant ne fasse que rendre. */
export const EMPTY_STATE_COPY: Readonly<Record<EmptyStateKind, { title: string; body: string; ctaLabel: string | null }>> = {
  "zone-not-mapped": {
    title: "Aucun tracé cartographié ici.",
    body: "OpenStreetMap ne référence pas de chemin dédié dans cette zone. Déplace la carte ou zoome ailleurs.",
    ctaLabel: "Contribuer sur OpenStreetMap →",
  },
  "filtered-out": {
    title: "tracés masqués par tes filtres.", // préfixé par le décompte au rendu (§7.3)
    body: "",
    ctaLabel: "Tout afficher",
  },
  "no-filter-active": {
    title: "Aucun sport sélectionné.",
    body: "Choisis au moins un sport pour voir les tracés.",
    ctaLabel: "Tout afficher",
  },
};
