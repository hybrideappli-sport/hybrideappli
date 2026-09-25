/**
 * Tokens de rendu de la carte — ADR-018, lot L3 ; `docs/design-carte.md` §2 (teintes, contrastes)
 * et §9 (bloc à insérer par `developer`).
 *
 * MapLibre n'interprète PAS les variables CSS (`docs/design-carte.md` §9.1) : ses propriétés
 * `paint`/`layout` attendent des littéraux. Ce module est donc la SOURCE UNIQUE en TypeScript,
 * consommée à la fois par les couches MapLibre (`map-layers.ts`) et par le style en ligne des
 * pastilles de filtre et des badges de la fiche de sélection — pour éviter la duplication
 * silencieuse que l'ADR redoute explicitement (« le token CSS change, la couche de carte non »).
 *
 * Les variables CSS `--map-*` (`apps/web/app/globals.css`, `docs/design-system.md` §1.5) restent
 * actives pour que la charte reste complète et lisible pour un humain qui la parcourt ; ce module
 * ne les importe pas (TypeScript ne lit pas non plus le CSS), donc `map-tokens.test.ts` vérifie
 * leur égalité littérale pour qu'un futur changement d'un seul côté ne passe jamais inaperçu.
 */
import type { MapSport } from "@hybride/domain";

/** §2.1 — famille dédiée, hors palette sémantique. */
export const MAP_COLORS: Readonly<Record<MapSport, string>> = {
  route: "#22d3ee",
  trail: "#f472b6",
  hike: "#e4e4e7",
  bike: "#fde047",
};

/** §2.1 — halo/liseré sous tout tracé (`--color-background`, réexposé sous son rôle cartographique). */
export const MAP_CASING_COLOR = "#0a0a0a";
/** §2.1, §5.5 — halo du tracé sélectionné (un seul à la fois). */
export const MAP_SELECTED_CASING_COLOR = "#ffffff";

/**
 * §5.2 — épaisseur de BASE d'un segment (`line-width`, px CSS), par palier de zoom. C'est la valeur
 * d'un segment ordinaire ; les itinéraires nommés la multiplient par `WIDTH_ROUTE_MULTIPLIER`
 * (§5.7) et le tracé sélectionné par `WIDTH_SELECTED_MULTIPLIER` (§5.5).
 */
export const WIDTH_BASE_STOPS: readonly [number, number][] = [
  [12, 2],
  [14, 2.5],
  [16, 3.5],
  [18, 5],
];

/** §5.7.1 — itinéraires nommés (relations `type=route`) : épaisseur × 1,5, halo élargi en conséquence. */
export const WIDTH_ROUTE_MULTIPLIER = 1.5;

/**
 * §5.5 point 1 — tracé sélectionné : × 1,35 et non × 1,6. C'est la valeur qui préserve l'ordre des
 * quatre significations d'épaisseur à tout niveau de zoom : `segment < segment sélectionné <
 * itinéraire < itinéraire sélectionné` (2 < 2,7 < 3 < 4,05 px au zoom 12) — voir
 * `map-tokens.test.ts` pour l'invariant vérifié à chaque palier de `WIDTH_BASE_STOPS`.
 */
export const WIDTH_SELECTED_MULTIPLIER = 1.35;

/** §5.2 — halo toujours plein, largeur = trait + 3 px (1,5 px de part et d'autre). */
export const CASING_EXTRA_WIDTH = 3;
/** §5.5 — halo de sélection, 2 px de part et d'autre du trait déjà élargi par la sélection. */
export const SELECTED_CASING_EXTRA_WIDTH = 4;

/**
 * §2.4 canal 1 — motif de trait par sport (multiples de `line-width`), réservé AU SPORT et à rien
 * d'autre (§5.7.1, §5.7.5 : le motif est le filet de sécurité de la couleur, pas un second canal
 * pour les itinéraires nommés). Absence de clé ⟹ trait continu (Route).
 */
export const MAP_LINE_DASH_ARRAY: Readonly<Partial<Record<MapSport, readonly number[]>>> = {
  bike: [3, 1.5],
  trail: [1.5, 1],
  hike: [0, 2],
};

export const MAP_LINE_CAP: Readonly<Record<MapSport, "round" | "butt">> = {
  route: "round",
  bike: "butt",
  trail: "butt",
  hike: "round",
};

/** §5.8 — seule ombre déjà admise par la charte (`--shadow-overlay`), réexposée pour les contrôles
 * flottants de `/carte` (§5.3 : proscrite ailleurs par la charte §3.3, exception documentée ici). */
export const MAP_CONTROL_SHADOW = "0 2px 8px rgba(0, 0, 0, 0.6)";
