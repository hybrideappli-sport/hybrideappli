/**
 * Une séance de 90 min n'entre pas dans un créneau `max_minutes = 45` ⟹ autre jour, ou annulation.
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

describe("placeWeekSessions — capacité déclarée (`max_minutes`)", () => {
  it("bascule sur un autre jour si le jour d'intention n'a pas la capacité", () => {
    const input = buildPlacementInput({
      calendar: [
        { weekday: 1, slot: "am", isAvailable: true, maxMinutes: 45 }, // lundi : trop court
        { weekday: 2, slot: "am", isAvailable: true, maxMinutes: 120 }, // mardi : suffisant
      ],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, slot: "am", durationMin: 90 })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    const decision = result.decisions[0]!;
    expect(decision.status).toBe("moved");
    expect(decision.date).toBe("2026-08-11");
  });

  it("annule explicitement si aucun jour de la semaine n'a la capacité requise", () => {
    const input = buildPlacementInput({
      calendar: [{ weekday: 1, slot: "am", isAvailable: true, maxMinutes: 45 }],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, slot: "am", durationMin: 90 })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    expect(result.decisions[0]).toMatchObject({ status: "cancelled_week", reason: "no_slot_available" });
  });

  it("un créneau sans `max_minutes` déclaré retombe sur `default_slot_capacity_min`", () => {
    const input = buildPlacementInput({
      calendar: [{ weekday: 1, slot: "am", isAvailable: true, maxMinutes: null }],
      sessions: [
        buildSession({
          sessionId: "s1",
          scheduledDate: WEEK_START,
          slot: "am",
          durationMin: RULESET_FOR_PLACEMENT.params.planning.default_slot_capacity_min + 1,
        }),
      ],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    expect(result.decisions[0]!.status).toBe("cancelled_week");
  });
});
