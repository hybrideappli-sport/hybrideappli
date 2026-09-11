"use client";

import { Backpack, Bike, Mountain, Route as RouteIcon } from "lucide-react";

import { MAP_SPORTS, type MapSport } from "@hybride/domain";

import { MAP_CASING_COLOR, MAP_COLORS, MAP_LINE_CAP, MAP_LINE_DASH_ARRAY } from "@/lib/map/map-tokens";
import { SPORT_LABELS_FR } from "@/lib/map/trail-selection-format";

/**
 * Pastilles de filtre par sport — ADR-018, lot L3 ; `docs/design-carte.md` §4.
 *
 * Variante de la charte §4.4 (chips de réponse) avec deux écarts assumés (§4) : le remplissage
 * prend la teinte du sport, et la sélection est MULTIPLE et INDÉPENDANTE (`aria-pressed`), pas
 * exclusive (`radiogroup`). Décocher une pastille ne fait RIEN d'autre que muter l'état React local
 * (`useActiveFilters`) : aucune requête réseau (critère d'acceptation ADR-018 L3).
 */

const SPORT_ICONS: Readonly<Record<MapSport, typeof RouteIcon>> = {
  route: RouteIcon,
  trail: Mountain,
  hike: Backpack,
  bike: Bike,
};

/** §2.4 canal 2 — échantillon de trait 16×2 px, reprenant le motif RÉEL du sport (pastille active =
 * légende, §4.2). Le halo noir n'a pas de sens sur un fond déjà à la teinte du sport : le trait est
 * simplement rendu en `--color-map-casing` (`#0A0A0A`), comme le prescrit §4.2. */
function TrailSample({ sport }: { sport: MapSport }) {
  const dashArray = MAP_LINE_DASH_ARRAY[sport];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <line
        x1="0"
        y1="8"
        x2="16"
        y2="8"
        stroke={MAP_CASING_COLOR}
        strokeWidth="2"
        strokeLinecap={MAP_LINE_CAP[sport]}
        strokeDasharray={dashArray ? dashArray.map((v) => v * 2).join(" ") : undefined}
      />
    </svg>
  );
}

export interface FilterPillsProps {
  activeFilters: ReadonlySet<MapSport>;
  onToggle: (sport: MapSport) => void;
}

export function FilterPills({ activeFilters, onToggle }: FilterPillsProps) {
  return (
    <div
      role="group"
      aria-label="Filtres par sport"
      data-testid="map-filter-pills"
      className="flex h-[68px] shrink-0 items-center gap-2 overflow-x-auto bg-background px-5"
      style={{ scrollSnapType: "x proximity", scrollPaddingInline: "20px" }}
    >
      {MAP_SPORTS.map((sport) => {
        const active = activeFilters.has(sport);
        const Icon = SPORT_ICONS[sport];
        return (
          <button
            key={sport}
            type="button"
            aria-pressed={active}
            data-testid={`map-filter-pill-${sport}`}
            onClick={() => onToggle(sport)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-small font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            style={{
              backgroundColor: active ? MAP_COLORS[sport] : "transparent",
              color: active ? MAP_CASING_COLOR : "var(--foreground-muted)",
              border: active ? "none" : "1px solid var(--border-strong)",
              scrollSnapAlign: "start",
            }}
          >
            {active ? <TrailSample sport={sport} /> : <Icon aria-hidden="true" size={16} />}
            {SPORT_LABELS_FR[sport]}
          </button>
        );
      })}
    </div>
  );
}
