/**
 * Formatage de la fiche de sélection et de son annonce `aria-live` — ADR-018, lot L3 ;
 * `docs/design-carte.md` §6.3 (distance, surface), §6.4 (badges), §6.5 (accessibilité).
 *
 * Pur, 0 I/O — le composant `SelectionSheet` ne fait que consommer ces fonctions.
 *
 * **Point laissé ouvert par §6.5, tranché par le fondateur le 2026-09-10** : l'exemple d'annonce
 * de §6.5 (« Sélection : chemin sans nom, portion de 340 mètres, Trail et Rando. ») ne mentionne
 * pas la surface, alors que la fiche l'affiche depuis l'amendement du 2026-09-10 (§6.3). Décision
 * du fondateur : cohérence stricte avec le visuel — l'annonce reprend TOUJOURS la mention de
 * surface, y compris « surface non renseignée ». Motif retenu : donner moins d'information à qui
 * en a déjà moins (l'utilisateur non-voyant) est le mauvais côté de l'arbitrage — réversible plus
 * tard si l'écoute s'avère pénible à l'usage. `buildSelectionAnnouncement()` l'applique.
 */
import type { MapSport } from "@hybride/domain";

import { SPORT_RENDER_PRIORITY } from "./render-sport";

export const SPORT_LABELS_FR: Readonly<Record<MapSport, string>> = {
  route: "Route",
  trail: "Trail",
  hike: "Rando",
  bike: "Vélo",
};

/** U+202F — espace insécable FINE, exigée avant l'unité par §6.3. */
const NARROW_NO_BREAK_SPACE = " ";

function formatOneDecimalFr(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/** §6.3 — `< 1 km ⟹ "850 m"` (entier) ; sinon `"4,2 km"` (une décimale, virgule fr-FR). */
export function formatDistanceCompact(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)}${NARROW_NO_BREAK_SPACE}m`;
  return `${formatOneDecimalFr(distanceKm)}${NARROW_NO_BREAK_SPACE}km`;
}

/**
 * §6.3, table « Format de la distance » — `name === null` ⟹ préfixe « Portion de » (c'est un
 * FRAGMENT OSM arbitraire, pas un chemin) ; way ou relation nommée ⟹ la distance nue.
 * `distanceKm === null` ⟹ `null` (fait omis, la ligne de méta se réduit ou disparaît).
 */
export function formatDistanceLabel(distanceKm: number | null, name: string | null): string | null {
  if (distanceKm === null) return null;
  const compact = formatDistanceCompact(distanceKm);
  return name === null ? `Portion de ${compact}` : compact;
}

const SURFACE_LABELS_FR: Readonly<Record<string, string>> = {
  asphalt: "Asphalte",
  concrete: "Béton",
  "concrete:plates": "Béton",
  "concrete:lanes": "Béton",
  paved: "Revêtu",
  paving_stones: "Pavés",
  sett: "Pavés anciens",
  chipseal: "Enduit gravillonné",
  wood: "Platelage bois",
  metal: "Métal",
  unpaved: "Non revêtu",
  ground: "Terrain naturel",
  dirt: "Terre",
  earth: "Terre",
  grass: "Herbe",
  gravel: "Gravier",
  fine_gravel: "Gravier fin",
  compacted: "Terre compactée",
  sand: "Sable",
  rock: "Roche",
  mud: "Boue",
};

/** §6.3 — décision du fondateur du 2026-09-10 : mention explicite, jamais la valeur PRÉSUMÉE. */
export const SURFACE_NOT_SPECIFIED_LABEL = "Surface non renseignée";

/**
 * `surface === null` OU `surfaceInferred === true` (73 % des cas) ⟹ mention d'absence explicite,
 * jamais la valeur devinée. Valeur connue mais hors table ⟹ valeur brute, 1ʳᵉ lettre capitale,
 * JAMAIS « Inconnu » (§6.3).
 */
export function formatSurfaceLabel(surface: string | null, surfaceInferred: boolean): string {
  if (surface === null || surfaceInferred) return SURFACE_NOT_SPECIFIED_LABEL;
  const known = SURFACE_LABELS_FR[surface];
  if (known) return known;
  return surface.charAt(0).toUpperCase() + surface.slice(1);
}

export interface SelectionMetaInput {
  name: string | null;
  distanceKm: number | null;
  surface: string | null;
  surfaceInferred: boolean;
}

/** §6.3 — une seule ligne, faits séparés par ` · `, dans l'ordre distance puis surface. La surface
 * n'est JAMAIS omise depuis le 2026-09-10 (contrairement à la distance, omise si `null`). */
export function buildSelectionMetaLine(input: SelectionMetaInput): string {
  const facts: string[] = [];
  const distance = formatDistanceLabel(input.distanceKm, input.name);
  if (distance) facts.push(distance);
  facts.push(formatSurfaceLabel(input.surface, input.surfaceInferred));
  return facts.join(" · ");
}

/** §6.3 — nom présent ⟹ le nom ; absent ⟹ « Chemin sans nom ». */
export function selectionTitle(name: string | null): string {
  return name ?? "Chemin sans nom";
}

export type SelectionBadgeKind = "named-route" | "rendered-sport" | "sport" | "sport-filtered-off";

export interface SelectionBadge {
  kind: SelectionBadgeKind;
  sport?: MapSport;
  label: string;
  ariaLabel?: string;
}

export interface SelectionBadgesInput {
  sports: readonly MapSport[];
  isNamedRoute: boolean;
  renderSport: MapSport | null;
  activeFilters: ReadonlySet<MapSport>;
}

/**
 * §6.4 — ordre : « ITINÉRAIRE » (si `isNamedRoute`) → sport effectivement rendu (plein) → autres
 * sports du tracé dont le filtre est ACTIF (contour), dans l'ordre de priorité de §3.1 → sports
 * portés mais dont le filtre est DÉCOCHÉ (contour atténué), en dernier.
 */
export function buildSelectionBadges(input: SelectionBadgesInput): SelectionBadge[] {
  const badges: SelectionBadge[] = [];
  if (input.isNamedRoute) badges.push({ kind: "named-route", label: "ITINÉRAIRE" });

  const orderedSports = SPORT_RENDER_PRIORITY.filter((sport) => input.sports.includes(sport));

  for (const sport of orderedSports) {
    if (sport === input.renderSport) {
      badges.push({ kind: "rendered-sport", sport, label: SPORT_LABELS_FR[sport] });
    } else if (input.activeFilters.has(sport)) {
      badges.push({ kind: "sport", sport, label: SPORT_LABELS_FR[sport] });
    }
  }
  for (const sport of orderedSports) {
    if (!input.activeFilters.has(sport)) {
      badges.push({
        kind: "sport-filtered-off",
        sport,
        label: SPORT_LABELS_FR[sport],
        ariaLabel: `${SPORT_LABELS_FR[sport]}, filtre désactivé`,
      });
    }
  }
  return badges;
}

function pluralizeFr(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}

/** Distance en toutes lettres, pour l'annonce `aria-live` (§6.5) — distincte du format compact
 * visuel (« 340 m » vs « 340 mètres »), la synthèse vocale n'abrégeant jamais une unité. */
export function formatDistanceSpelled(distanceKm: number, name: string | null): string {
  const spelled =
    distanceKm < 1
      ? (() => {
          const meters = Math.round(distanceKm * 1000);
          return `${meters} ${pluralizeFr(meters, "mètre", "mètres")}`;
        })()
      : `${formatOneDecimalFr(distanceKm)} ${pluralizeFr(distanceKm, "kilomètre", "kilomètres")}`;
  return name === null ? `portion de ${spelled}` : spelled;
}

function joinSportsFr(sports: readonly MapSport[]): string {
  const labels = SPORT_RENDER_PRIORITY.filter((sport) => sports.includes(sport)).map((sport) => SPORT_LABELS_FR[sport]);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

export interface SelectionAnnouncementInput {
  name: string | null;
  isNamedRoute: boolean;
  distanceKm: number | null;
  surface: string | null;
  surfaceInferred: boolean;
  sports: readonly MapSport[];
}

/**
 * §6.5 — « Sélection : *titre*, *méta*, *sports*. ». La surface est TOUJOURS mentionnée (décision
 * du fondateur du 2026-09-10, voir l'en-tête de fichier) : cohérence stricte avec le visuel, où
 * elle ne disparaît jamais depuis l'amendement du même jour.
 */
export function buildSelectionAnnouncement(input: SelectionAnnouncementInput): string {
  const parts: string[] = [input.name ?? "chemin sans nom"];
  if (input.isNamedRoute) parts.push("itinéraire balisé");
  if (input.distanceKm !== null) parts.push(formatDistanceSpelled(input.distanceKm, input.name));
  parts.push(formatSurfaceLabel(input.surface, input.surfaceInferred).toLowerCase());

  const sportsText = joinSportsFr(input.sports);
  if (sportsText) parts.push(sportsText);

  return `Sélection : ${parts.join(", ")}.`;
}
