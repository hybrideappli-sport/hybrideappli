/**
 * Construit la `FeatureCollection` poussée à la source MapLibre des tracés — ADR-018, lot L3 ;
 * `docs/design-carte.md` §3 (livrable 2), §5.5, §5.7.2, §9.2 dernier paragraphe.
 *
 * Recalculée intégralement à CHAQUE changement de filtre (les tracés bruts, eux, ne changent qu'au
 * fetch réseau — §3.1 : « aucune requête réseau »), puis poussée par `GeoJSONSource.setData()`
 * côté appelant (`use-trails-layer.ts`). Pur, 0 I/O : testable sans MapLibre.
 */
import type { MapSport, MapTrailFeature, MapTrailGeometry, MapTrailProperties } from "@hybride/domain";

import { isNamedRoute, pickRenderSport } from "./render-sport";

export interface TrailRenderProperties extends MapTrailProperties {
  /** Calculé (§5.7.2) — jamais dans `MapTrailProperties`. */
  isNamedRoute: boolean;
  /**
   * Calculé (§3.1). ABSENT (pas `null`) quand aucun filtre actif ne retient ce tracé : les filtres
   * de couches de `map-layers.ts` testent `["has","renderSport"]`, et un `has` MapLibre renvoie
   * `true` pour une propriété présente même si sa valeur est `null` — l'omettre est donc l'unique
   * façon correcte d'exclure le tracé de toutes les couches de trait (§9.2).
   */
  renderSport?: MapSport;
}

export interface TrailRenderFeature {
  type: "Feature";
  geometry: MapTrailGeometry;
  properties: TrailRenderProperties;
}

export interface TrailRenderFeatureCollection {
  type: "FeatureCollection";
  features: TrailRenderFeature[];
}

/**
 * §5.5, §5.7.2 — dédoublonnage DÉFENSIF par `osmId` : L2 dédoublonne déjà entre tuiles
 * (`trails-service.ts`), mais la contrainte « le chemin doit être dessiné une seule fois » est un
 * invariant de RENDU, pas seulement de cache — il est donc revérifié ici, au point où la source
 * MapLibre est construite. Premier arrivé conservé (ordre stable du tableau d'entrée).
 */
export function buildTrailRenderFeatureCollection(
  trails: readonly MapTrailFeature[],
  activeFilters: ReadonlySet<MapSport>,
): TrailRenderFeatureCollection {
  const seenOsmIds = new Set<string>();
  const features: TrailRenderFeature[] = [];

  for (const trail of trails) {
    if (seenOsmIds.has(trail.properties.osmId)) continue;
    seenOsmIds.add(trail.properties.osmId);

    const renderSport = pickRenderSport(trail.properties.sports, activeFilters);
    const properties: TrailRenderProperties = {
      ...trail.properties,
      isNamedRoute: isNamedRoute(trail),
    };
    if (renderSport) properties.renderSport = renderSport;

    features.push({ type: "Feature", geometry: trail.geometry, properties });
  }

  return { type: "FeatureCollection", features };
}

/** Nombre de tracés effectivement RENDUS (un `renderSport`), par sport — §3.5, pour l'annonce `aria-live`. */
export function countRenderedBySport(collection: TrailRenderFeatureCollection): Record<MapSport, number> {
  const counts: Record<MapSport, number> = { route: 0, trail: 0, hike: 0, bike: 0 };
  for (const feature of collection.features) {
    if (feature.properties.renderSport) counts[feature.properties.renderSport] += 1;
  }
  return counts;
}

/** Nombre d'itinéraires balisés effectivement rendus — §3.5, §5.7.6. */
export function countRenderedNamedRoutes(collection: TrailRenderFeatureCollection): number {
  return collection.features.filter((feature) => feature.properties.renderSport && feature.properties.isNamedRoute).length;
}
