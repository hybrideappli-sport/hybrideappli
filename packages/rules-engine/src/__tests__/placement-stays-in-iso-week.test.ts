/**
 * Jamais de placement hors de la semaine ISO ⇒ aucun report cumulatif — AC4.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { addDays } from "../lib/dates";
import { buildFullWeekCalendar, buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

const WEEK_DATES = Array.from({ length: 7 }, (_, i) => addDays(WEEK_START, i));

describe("placeWeekSessions — AC4, jamais au-delà de la semaine ISO", () => {
  it("property: pour toute combinaison de séances/disponibilités, chaque décision non annulée tombe dans [weekStart, weekStart+6]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dayIndex: fc.integer({ min: 0, max: 6 }),
            durationMin: fc.integer({ min: 15, max: 180 }),
            slot: fc.constantFrom(...(["am", "pm", "unspecified"] as const)),
          }),
          { minLength: 0, maxLength: 8 },
        ),
        fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 0, maxLength: 7 }), // jours fermés
        (sessionSpecs, closedDayIndexes) => {
          const closed = new Set(closedDayIndexes);
          const calendar = buildFullWeekCalendar().filter((w) => !closed.has(w.weekday - 1));
          const sessions = sessionSpecs.map((spec, index) =>
            buildSession({
              sessionId: `s${index}`,
              scheduledDate: WEEK_DATES[spec.dayIndex]!,
              slot: spec.slot,
              durationMin: spec.durationMin,
              orderInDay: index,
            }),
          );

          const result = placeWeekSessions(buildPlacementInput({ calendar, sessions }), RULESET_FOR_PLACEMENT);

          for (const decision of result.decisions) {
            if (decision.status === "cancelled_week") {
              expect(decision.date).toBeNull();
              continue;
            }
            expect(WEEK_DATES).toContain(decision.date);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
