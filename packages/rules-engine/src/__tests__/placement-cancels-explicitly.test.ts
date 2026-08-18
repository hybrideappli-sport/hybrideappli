/**
 * Semaine saturée ⇒ `cancelled_week` + `reason = 'no_slot_available'`, jamais une disparition — AC4.
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

describe("placeWeekSessions — AC4, annulation explicite", () => {
  it("annule explicitement une séance qui ne rentre nulle part dans la semaine, jamais silencieusement", () => {
    const input = buildPlacementInput({
      calendar: [], // aucune disponibilité déclarée du tout
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, origin: { date: WEEK_START, time: "18:30" } })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);

    expect(result.decisions).toHaveLength(1); // la séance N'A PAS disparu de la sortie
    expect(result.decisions[0]).toMatchObject({
      sessionId: "s1",
      status: "cancelled_week",
      date: null,
      startTime: null,
      reason: "no_slot_available",
      originDate: WEEK_START,
      originTime: "18:30",
    });
  });

  it("une séance jamais placée dès le premier calcul porte un `originTime` null (design §4)", () => {
    const input = buildPlacementInput({
      calendar: [],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, origin: null })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    expect(result.decisions[0]).toMatchObject({ status: "cancelled_week", originDate: WEEK_START, originTime: null });
  });
});
