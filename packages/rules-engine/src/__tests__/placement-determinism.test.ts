/**
 * Deux exécutions sur la même entrée produisent des décisions strictement identiques
 * (pendant de `determinism.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildFrozenOccupancy, buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

describe("placeWeekSessions — déterminisme", () => {
  it("produit une sortie strictement identique sur deux exécutions de la même entrée", () => {
    const input = buildPlacementInput({
      calendar: [
        { weekday: 1, slot: "am", isAvailable: true, maxMinutes: 90 },
        { weekday: 2, slot: "pm", isAvailable: true, maxMinutes: 90 },
        { weekday: 3, slot: "am", isAvailable: true, maxMinutes: 60 },
      ],
      frozenOccupancy: [buildFrozenOccupancy({ date: "2026-08-11", startTime: "18:30" })],
      sessions: [
        buildSession({ sessionId: "s1", scheduledDate: WEEK_START, slot: "am", durationMin: 60, orderInDay: 1 }),
        buildSession({ sessionId: "s2", scheduledDate: "2026-08-12", slot: "am", durationMin: 45, sessionType: "strength", orderInDay: 1 }),
      ],
    });

    const first = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    const second = placeWeekSessions(input, RULESET_FOR_PLACEMENT);

    expect(second).toStrictEqual(first);
  });
});
