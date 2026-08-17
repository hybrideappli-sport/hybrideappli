/**
 * ADR-016 §5, `08-architecture.md` §14.1 — le type de sortie de l'algorithme de placement
 * (`PlacementDecision`) ne porte AUCUNE clé de contenu (type de séance, durée, charge, zone
 * d'intensité, prescription, groupes musculaires, sport). C'est ce qui garantit F3 ↛ moteur : le
 * placement ne peut structurellement pas influencer ni relire le contenu produit par F1.
 *
 * Fichier manquant relevé par le second audit `code-reviewer` (finding B5, revue post-`aaba499`) :
 * `placement-never-changes-content.property.test.ts` existe déjà et exerce cette même liste de
 * clés sur un grand nombre de contextes générés (property-based) — ce fichier-ci fige l'invariant
 * indépendamment, sur un cas minimal déterministe, sous le nom exact désigné par
 * `08-architecture.md` §14.1, pour qu'aucune modification future de la property ne puisse le faire
 * disparaître silencieusement.
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildFullWeekCalendar, buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

const ALLOWED_DECISION_KEYS = ["sessionId", "status", "date", "startTime", "originDate", "originTime", "reason", "incidentId", "guardrailsChecked"].sort();

const FORBIDDEN_CONTENT_KEYS = ["sessionType", "durationMin", "loadUnits", "intensityZone", "prescription", "muscleGroups", "sportCode"];

describe("placement-output-has-no-content — ADR-016 §5", () => {
  it("PlacementDecision ne porte que les clés de placement, jamais une clé de contenu", () => {
    const sessions = [
      buildSession({ sessionId: "s1", scheduledDate: WEEK_START, sessionType: "interval", durationMin: 60 }),
      buildSession({ sessionId: "s2", scheduledDate: WEEK_START, sessionType: "strength", durationMin: 45, orderInDay: 1 }),
    ];
    const result = placeWeekSessions(buildPlacementInput({ calendar: buildFullWeekCalendar(), sessions }), RULESET_FOR_PLACEMENT);

    expect(result.decisions.length).toBeGreaterThan(0);
    for (const decision of result.decisions) {
      expect(Object.keys(decision).sort()).toStrictEqual(ALLOWED_DECISION_KEYS);
      for (const forbiddenKey of FORBIDDEN_CONTENT_KEYS) {
        expect(decision).not.toHaveProperty(forbiddenKey);
        expect(decision).not.toHaveProperty(forbiddenKey.toLowerCase());
      }
    }
  });

  it("PlacementResult lui-même ne porte qu'une seule clé (`decisions`)", () => {
    const result = placeWeekSessions(
      buildPlacementInput({ calendar: buildFullWeekCalendar(), sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START })] }),
      RULESET_FOR_PLACEMENT,
    );
    expect(Object.keys(result)).toStrictEqual(["decisions"]);
  });
});
