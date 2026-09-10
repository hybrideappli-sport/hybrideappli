import { MAP_CASING_COLOR, MAP_COLORS, MAP_LINE_CAP, MAP_LINE_DASH_ARRAY } from "@/lib/map/map-tokens";
import type { MapSport } from "@hybride/domain";

import type { TrailRenderFeature } from "@/lib/map/trail-render-source";
import { buildSelectionBadges, buildSelectionMetaLine, selectionTitle, type SelectionBadge } from "@/lib/map/trail-selection-format";

/**
 * Fiche de sélection — ADR-018, lot L3 ; `docs/design-carte.md` §6 (entièrement réécrit le
 * 2026-09-09 : « une seule forme, dimensionnée sur le cas MAJORITAIRE », pas de champ dénivelé,
 * pas même vide).
 *
 * Hauteur FIXE (~128 px, 154 px si le titre passe à 2 lignes) — jamais de scroll interne, jamais
 * de poignée (§6.2 : « la promesse d'un second point d'ancrage inexistant »). Le focus ne bouge
 * JAMAIS à l'ouverture (§6.5) : la sortie non visuelle passe par la région `aria-live`, pas par le
 * focus, condition pour que le parcours au viseur (§5.4.1) reste praticable tap après tap.
 */

function BadgePill({ badge }: { badge: SelectionBadge }) {
  if (badge.kind === "named-route") {
    return (
      <span className="rounded-full border border-foreground px-2.5 py-1 text-label text-foreground" data-testid="selection-badge-named-route">
        {badge.label}
      </span>
    );
  }
  const color = badge.sport ? MAP_COLORS[badge.sport] : MAP_CASING_COLOR;
  if (badge.kind === "rendered-sport") {
    return (
      <span
        className="rounded-full px-2.5 py-1 text-label"
        style={{ backgroundColor: color, color: MAP_CASING_COLOR }}
        data-testid={`selection-badge-${badge.sport}`}
      >
        {badge.label}
      </span>
    );
  }
  const muted = badge.kind === "sport-filtered-off";
  return (
    <span
      className="rounded-full border px-2.5 py-1 text-label"
      style={{ borderColor: muted ? "var(--foreground-subtle)" : color, color: muted ? "var(--foreground-subtle)" : color }}
      aria-label={badge.ariaLabel}
      data-testid={`selection-badge-${badge.sport}`}
    >
      {badge.label}
    </span>
  );
}

function TrailSampleIcon({ sport, isNamedRoute }: { sport: MapSport; isNamedRoute: boolean }) {
  const dashArray = MAP_LINE_DASH_ARRAY[sport];
  const strokeWidth = isNamedRoute ? 4.5 : 3;
  return (
    <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true" focusable="false" className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="20"
        y2="4"
        stroke={MAP_CASING_COLOR}
        strokeWidth={strokeWidth + 2}
        strokeLinecap={MAP_LINE_CAP[sport]}
        strokeDasharray={dashArray ? dashArray.map((v) => v * strokeWidth).join(" ") : undefined}
      />
      <line
        x1="0"
        y1="4"
        x2="20"
        y2="4"
        stroke={MAP_COLORS[sport]}
        strokeWidth={strokeWidth}
        strokeLinecap={MAP_LINE_CAP[sport]}
        strokeDasharray={dashArray ? dashArray.map((v) => v * strokeWidth).join(" ") : undefined}
      />
    </svg>
  );
}

export interface SelectionSheetProps {
  feature: TrailRenderFeature;
  activeFilters: ReadonlySet<MapSport>;
  onClose: () => void;
}

export function SelectionSheet({ feature, activeFilters, onClose }: SelectionSheetProps) {
  const { properties } = feature;
  const renderSport = properties.renderSport ?? null;
  const title = selectionTitle(properties.name);
  const metaLine = buildSelectionMetaLine(properties);
  const badges = buildSelectionBadges({
    sports: properties.sports,
    isNamedRoute: properties.isNamedRoute,
    renderSport,
    activeFilters,
  });

  return (
    <section
      role="region"
      aria-label="Tracé sélectionné"
      data-testid="map-selection-sheet"
      className="absolute inset-x-5 bottom-0 z-20 rounded-t-lg bg-surface p-4 shadow-[0_-8px_24px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-start gap-3">
        {renderSport ? (
          <div className="mt-1.5">
            <TrailSampleIcon sport={renderSport} isNamedRoute={properties.isNamedRoute} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-heading text-foreground" data-testid="selection-title">
            {title}
          </p>
          {metaLine ? (
            <p className="text-small text-foreground-muted" data-testid="selection-meta">
              {metaLine}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2" data-testid="selection-badges">
            {badges.map((badge) => (
              <BadgePill key={`${badge.kind}-${badge.sport ?? "named-route"}`} badge={badge} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer les informations du tracé"
          data-testid="selection-close-button"
          className="flex size-11 shrink-0 items-center justify-center text-foreground-muted hover:text-foreground"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </section>
  );
}
