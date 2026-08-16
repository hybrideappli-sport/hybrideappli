/**
 * Property-based : sur un grand nombre de contextes générés, `PlacementDecision` ne porte jamais
 * un champ de contenu de séance (type, durée, charge, prescription) — AC2, AC3. C'est une
 * propriété de TYPE (ADR-016 §5), vérifiée ici à la fois structurellement (les clés produites) et
 * à l'exécution (aucune valeur d'entrée de contenu ne "fuit" dans la sortie).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { addDays } from "../lib/dates";
import { buildFullWeekCalendar, buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

const ALLOWED_DECISION_KEYS = ["sessionId", "status", "date", "startTime", "originDate", "originTime", "reason", "incidentId", "guardrailsChecked"].sort();

const FORBIDDEN_CONTENT_KEYS = ["sessionType", "durationMin", "loadUnits", "intensityZone", "prescription", "muscleGroups", "sportCode"];

describe("placeWeekSessions — AC2/AC3, le contenu ne fuit jamais dans la sortie", () => {
  it("property: chaque décision ne porte QUE les clés autorisées, jamais un champ de contenu", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dayIndex: fc.integer({ min: 0, max: 6 }),
            durationMin: fc.integer({ min: 15, max: 150 }),
            sessionType: fc.constantFrom(...(["endurance", "tempo", "interval", "strength", "long", "power", "mobility", "technique", "cross_training"] as const)),
          }),
          { minLength: 0, maxLength: 8 },
        ),
        (specs) => {
          const sessions = specs.map((spec, index) =>
            buildSession({
              sessionId: `s${index}`,
              scheduledDate: addDays(WEEK_START, spec.dayIndex),
              durationMin: spec.durationMin,
              sessionType: spec.sessionType,
              orderInDay: index,
            }),
          );
          const result = placeWeekSessions(buildPlacementInput({ calendar: buildFullWeekCalendar(), sessions }), RULESET_FOR_PLACEMENT);

          for (const decision of result.decisions) {
            expect(Object.keys(decision).sort()).toStrictEqual(ALLOWED_DECISION_KEYS);
            for (const forbiddenKey of FORBIDDEN_CONTENT_KEYS) {
              expect(decision).not.toHaveProperty(forbiddenKey);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ne modifie jamais l'entrée qui lui est passée (aucune mutation)", () => {
    const input = buildPlacementInput({
      calendar: buildFullWeekCalendar(),
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, sessionType: "interval", durationMin: 60 })],
    });
    const snapshot = JSON.parse(JSON.stringify(input));

    placeWeekSessions(input, RULESET_FOR_PLACEMENT);

    expect(input).toStrictEqual(snapshot);
  });
});
