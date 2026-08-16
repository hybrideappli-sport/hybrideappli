/**
 * Aucun placement ne crée un dépassement de `max_consecutive_days_without_rest`, ni deux séances
 * intenses le même jour (sauf autorisation explicite), ni une violation d'espacement
 * intense/force — garde-fous HÉRITÉS de la Feature 1, revérifiés par la F3 (fiche §5, AC3).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SessionType } from "@hybride/domain";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { isIntenseSessionType } from "../lib/guardrail-helpers";
import { addDays, diffDays } from "../lib/dates";
import { buildFullWeekCalendar, buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

const DAY_TYPES = ["endurance", "tempo", "interval", "strength", "mobility"] as const;

describe("placeWeekSessions — garde-fous hérités revérifiés (AC3, AC8, AC10)", () => {
  it("property: jamais deux séances intenses le même jour quand `allow_two_intense_sessions_same_day = false`", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            dayIndex: fc.integer({ min: 0, max: 6 }),
            sessionType: fc.constantFrom(...DAY_TYPES),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (specs) => {
          const sessions = specs.map((spec, index) =>
            buildSession({
              sessionId: `s${index}`,
              scheduledDate: WEEK_DATE(spec.dayIndex),
              sessionType: spec.sessionType,
              orderInDay: index,
              durationMin: 30,
            }),
          );
          const result = placeWeekSessions(buildPlacementInput({ calendar: buildFullWeekCalendar(), sessions }), RULESET_FOR_PLACEMENT);

          const byDate = new Map<string, SessionType[]>();
          for (const decision of result.decisions) {
            if (decision.status === "cancelled_week" || !decision.date) continue;
            const type = sessions.find((s) => s.sessionId === decision.sessionId)!.sessionType;
            const list = byDate.get(decision.date) ?? [];
            list.push(type);
            byDate.set(decision.date, list);
          }
          for (const types of byDate.values()) {
            const intenseCount = types.filter((t) => isIntenseSessionType(t)).length;
            expect(intenseCount).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: jamais plus de `max_consecutive_days_without_rest` jours consécutifs occupés", () => {
    const maxConsecutive = RULESET_FOR_PLACEMENT.params.guardrails.max_consecutive_days_without_rest!;
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 0, maxLength: 7 }), (dayIndexes) => {
        const uniqueDays = Array.from(new Set(dayIndexes));
        const sessions = uniqueDays.map((dayIndex, index) =>
          buildSession({ sessionId: `s${index}`, scheduledDate: WEEK_DATE(dayIndex), durationMin: 30, orderInDay: index }),
        );
        const result = placeWeekSessions(buildPlacementInput({ calendar: buildFullWeekCalendar(), sessions }), RULESET_FOR_PLACEMENT);

        // Dates UNIQUES : deux séances peuvent partager le même jour (`max_sessions_per_day`),
        // ce qui ne prolonge pas la série de jours consécutifs d'entraînement.
        const placedDates = Array.from(new Set(result.decisions.filter((d) => d.status !== "cancelled_week").map((d) => d.date!))).sort();
        expect(longestRun(placedDates)).toBeLessThanOrEqual(maxConsecutive);
      }),
      { numRuns: 100 },
    );
  });

  it("respecte l'espacement minimal entre une séance intense et une séance de force sur les mêmes groupes musculaires", () => {
    const input = buildPlacementInput({
      calendar: [
        { weekday: 1, slot: "am", isAvailable: true, maxMinutes: null },
        { weekday: 1, slot: "pm", isAvailable: true, maxMinutes: null },
      ],
      frozenOccupancy: [{ date: WEEK_START, startTime: "07:00", durationMin: 45, sessionType: "interval", muscleGroups: ["quads", "hamstrings"] }],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, sessionType: "strength", muscleGroups: ["quads"], durationMin: 45 })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    // Aucun créneau du même jour ne respecte 48h d'espacement avec une séance à 07h00 : annulée
    // cette semaine (aucun autre jour n'est déclaré disponible dans ce test).
    expect(result.decisions[0]!.status).toBe("cancelled_week");
  });
});

function WEEK_DATE(dayIndex: number): string {
  return addDays(WEEK_START, dayIndex);
}

function longestRun(sortedDates: string[]): number {
  let longest = 0;
  let runStart = 0;
  for (let i = 1; i <= sortedDates.length; i++) {
    const broke = i === sortedDates.length || diffDays(sortedDates[i - 1]!, sortedDates[i]!) > 1;
    if (broke) {
      longest = Math.max(longest, i - runStart);
      runStart = i;
    }
  }
  return longest;
}
