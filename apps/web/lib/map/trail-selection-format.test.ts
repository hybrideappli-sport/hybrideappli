import { describe, expect, it } from "vitest";

import type { MapSport } from "@hybride/domain";

import {
  buildSelectionAnnouncement,
  buildSelectionBadges,
  buildSelectionMetaLine,
  formatDistanceCompact,
  formatDistanceLabel,
  formatSurfaceLabel,
  selectionTitle,
  SURFACE_NOT_SPECIFIED_LABEL,
} from "./trail-selection-format";

describe("formatDistanceCompact (design-carte.md §6.3)", () => {
  it("< 1 km : entier, sans décimale", () => {
    expect(formatDistanceCompact(0.34)).toBe("340 m");
  });

  it(">= 1 km : une décimale, virgule fr-FR", () => {
    expect(formatDistanceCompact(1.2)).toBe("1,2 km");
    expect(formatDistanceCompact(12.4)).toBe("12,4 km");
  });
});

describe("formatDistanceLabel — table exacte de §6.3", () => {
  it("name === null ⟹ préfixe « Portion de » (fragment OSM arbitraire)", () => {
    expect(formatDistanceLabel(0.34, null)).toBe("Portion de 340 m");
    expect(formatDistanceLabel(1.2, null)).toBe("Portion de 1,2 km");
  });

  it("name !== null (way ou relation) ⟹ la distance nue, sans préfixe", () => {
    expect(formatDistanceLabel(1.2, "Chemin renseigné")).toBe("1,2 km");
    expect(formatDistanceLabel(12.4, "Sentier du Littoral")).toBe("12,4 km");
  });

  it("distanceKm === null ⟹ fait omis (null)", () => {
    expect(formatDistanceLabel(null, null)).toBeNull();
  });
});

describe("formatSurfaceLabel — décision du fondateur du 2026-09-10 (§6.3)", () => {
  it("surface null ⟹ mention explicite, jamais un tiret ni une valeur devinée", () => {
    expect(formatSurfaceLabel(null, false)).toBe(SURFACE_NOT_SPECIFIED_LABEL);
  });

  it("surfaceInferred === true ⟹ mention explicite MÊME si une valeur est présente (présomption jamais affichée)", () => {
    expect(formatSurfaceLabel("track", true)).toBe(SURFACE_NOT_SPECIFIED_LABEL);
  });

  it("valeur connue de la table ⟹ libellé fr", () => {
    expect(formatSurfaceLabel("asphalt", false)).toBe("Asphalte");
    expect(formatSurfaceLabel("fine_gravel", false)).toBe("Gravier fin");
  });

  it("valeur inconnue de la table ⟹ valeur brute capitalisée, jamais « Inconnu »", () => {
    expect(formatSurfaceLabel("woodchips", false)).toBe("Woodchips");
  });
});

describe("buildSelectionMetaLine — la surface n'est JAMAIS omise depuis le 2026-09-10", () => {
  it("cas majoritaire : « Portion de 340 m · Surface non renseignée » (exemple exact de §6.3)", () => {
    expect(buildSelectionMetaLine({ name: null, distanceKm: 0.34, surface: null, surfaceInferred: true })).toBe(
      "Portion de 340 m · Surface non renseignée",
    );
  });

  it("cas rare renseigné : « 12,4 km · Terre battue » (exemple exact de §6.3, tracktype-like)", () => {
    expect(
      buildSelectionMetaLine({ name: "Sentier du Littoral", distanceKm: 12.4, surface: "compacted", surfaceInferred: false }),
    ).toBe("12,4 km · Terre compactée");
  });

  it("distance absente : la surface reste seule sur la ligne", () => {
    expect(buildSelectionMetaLine({ name: null, distanceKm: null, surface: null, surfaceInferred: true })).toBe(SURFACE_NOT_SPECIFIED_LABEL);
  });
});

describe("selectionTitle", () => {
  it("nom présent ⟹ le nom ; absent ⟹ « Chemin sans nom »", () => {
    expect(selectionTitle("Sentier du Littoral")).toBe("Sentier du Littoral");
    expect(selectionTitle(null)).toBe("Chemin sans nom");
  });
});

const ALL_ACTIVE = new Set<MapSport>(["route", "trail", "hike", "bike"]);

describe("buildSelectionBadges — l'ordre rend la règle de priorité auto-explicative (§6.4)", () => {
  it("ITINÉRAIRE en premier, puis le sport rendu (plein), puis les autres sports actifs (contour)", () => {
    const badges = buildSelectionBadges({ sports: ["trail", "hike"], isNamedRoute: true, renderSport: "trail", activeFilters: ALL_ACTIVE });
    expect(badges.map((badge) => [badge.kind, badge.label])).toEqual([
      ["named-route", "ITINÉRAIRE"],
      ["rendered-sport", "Trail"],
      ["sport", "Rando"],
    ]);
  });

  it("un sport porté par le tracé mais dont le filtre est décoché arrive en DERNIER, avec l'aria-label dédié", () => {
    const badges = buildSelectionBadges({
      sports: ["trail", "hike", "bike"],
      isNamedRoute: false,
      renderSport: "trail",
      activeFilters: new Set(["trail", "hike"]),
    });
    expect(badges.map((badge) => badge.kind)).toEqual(["rendered-sport", "sport", "sport-filtered-off"]);
    expect(badges.at(-1)).toMatchObject({ sport: "bike", label: "Vélo", ariaLabel: "Vélo, filtre désactivé" });
  });

  it("aucun badge « ITINÉRAIRE » si isNamedRoute est faux", () => {
    const badges = buildSelectionBadges({ sports: ["hike"], isNamedRoute: false, renderSport: "hike", activeFilters: ALL_ACTIVE });
    expect(badges.some((badge) => badge.kind === "named-route")).toBe(false);
  });
});

describe("buildSelectionAnnouncement — §6.5, la surface est TOUJOURS reprise (décision du fondateur, 2026-09-10)", () => {
  it("cas majoritaire, mis à jour avec la mention de surface (l'exemple de §6.5 date d'avant l'amendement du 2026-09-10)", () => {
    const announcement = buildSelectionAnnouncement({
      name: null,
      isNamedRoute: false,
      distanceKm: 0.34,
      surface: null,
      surfaceInferred: true,
      sports: ["trail", "hike"],
    });
    expect(announcement).toBe("Sélection : chemin sans nom, portion de 340 mètres, surface non renseignée, Trail et Rando.");
  });

  it("cas itinéraire nommé (exemple exact de §6.5, la surface y figurait déjà)", () => {
    const announcement = buildSelectionAnnouncement({
      name: "Sentier du Littoral",
      isNamedRoute: true,
      distanceKm: 12.4,
      surface: "compacted",
      surfaceInferred: false,
      sports: ["hike"],
    });
    expect(announcement).toBe("Sélection : Sentier du Littoral, itinéraire balisé, 12,4 kilomètres, terre compactée, Rando.");
  });

  it("un seul sport ⟹ pas de « et » superflu", () => {
    const announcement = buildSelectionAnnouncement({
      name: null,
      isNamedRoute: false,
      distanceKm: 0.1,
      surface: null,
      surfaceInferred: true,
      sports: ["bike"],
    });
    expect(announcement).toBe("Sélection : chemin sans nom, portion de 100 mètres, surface non renseignée, Vélo.");
  });

  it("trois sports ⟹ virgules puis « et » avant le dernier", () => {
    const announcement = buildSelectionAnnouncement({
      name: "Voie verte",
      isNamedRoute: false,
      distanceKm: 2,
      surface: "asphalt",
      surfaceInferred: false,
      sports: ["bike", "trail", "hike"],
    });
    expect(announcement).toBe("Sélection : Voie verte, 2,0 kilomètres, asphalte, Vélo, Trail et Rando.");
  });
});
