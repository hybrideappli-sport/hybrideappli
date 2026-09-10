/**
 * ADR-018 §6 — « Aucun identifiant utilisateur, aucun champ de plan, aucun `planned_session_id`,
 * aucune date. » Même patron que `PlacementDecision` (ADR-016 §5,
 * `packages/rules-engine/src/__tests__/placement-output-has-no-content.test.ts`) : le périmètre
 * « lecture seule, aucun lien avec le moteur » devient une PROPRIÉTÉ DE TYPE vérifiée par le
 * compilateur, et ce test la fige indépendamment sur un cas minimal déterministe, pour qu'aucune
 * modification future ne puisse la faire disparaître silencieusement.
 */

import { describe, expect, it } from "vitest";
import type { MapTrailFeature, MapTrailProperties, MapTrailsResponse } from "../map-trails.js";

const ALLOWED_PROPERTY_KEYS = ["osmId", "sports", "name", "distanceKm", "elevationGainM", "surface", "surfaceInferred", "osmUrl"].sort();

const FORBIDDEN_KEYS = ["userId", "user_id", "plannedSessionId", "planned_session_id", "date", "scheduledDate", "planVersionId", "sessionId"];

function buildSampleProperties(): MapTrailProperties {
  return {
    osmId: "way/1",
    sports: ["hike"],
    name: null,
    distanceKm: null,
    elevationGainM: null,
    surface: null,
    surfaceInferred: true,
    osmUrl: "https://www.openstreetmap.org/way/1",
  };
}

describe("MapTrailProperties — ADR-018 §6, lecture seule sans lien plan/moteur", () => {
  it("ne porte que les clés du contrat, jamais une clé de plan ou d'identité utilisateur", () => {
    const properties = buildSampleProperties();
    expect(Object.keys(properties).sort()).toStrictEqual(ALLOWED_PROPERTY_KEYS);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(properties).not.toHaveProperty(forbidden);
    }
  });

  it("`elevationGainM` est structurellement TOUJOURS null (phase 1, §6)", () => {
    const properties = buildSampleProperties();
    expect(properties.elevationGainM).toBeNull();
  });
});

describe("MapTrailsResponse — ne porte que les clés du contrat §6", () => {
  it("l'enveloppe de réponse ne porte aucune clé additionnelle", () => {
    const response: MapTrailsResponse = {
      status: "ok",
      degraded: false,
      truncated: false,
      tiles: ["12/2062/1408"],
      attribution: "© les contributeurs d'OpenStreetMap",
      trails: [] as MapTrailFeature[],
    };
    expect(Object.keys(response).sort()).toStrictEqual(["attribution", "degraded", "status", "tiles", "trails", "truncated"].sort());
  });
});
