/**
 * Après un imprévu, un créneau libre le même jour est préféré à un autre jour — AC3.
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

describe("placeWeekSessions — AC3, préférence au même jour", () => {
  it("replace sur le même jour si un créneau libre y existe encore, plutôt que sur un autre jour", () => {
    const input = buildPlacementInput({
      calendar: [
        { weekday: 1, slot: "am", isAvailable: true, maxMinutes: null }, // lundi matin, libre
        { weekday: 1, slot: "pm", isAvailable: true, maxMinutes: null }, // lundi soir, libre aussi
        { weekday: 2, slot: "am", isAvailable: true, maxMinutes: null }, // mardi, libre
      ],
      triggerReason: "incident_reported",
      incidentId: "incident-1",
      // Le créneau initial (lundi matin) est neutralisé par l'imprévu signalé.
      incidentWindows: [{ date: WEEK_START, fromTime: "05:00", toTime: "13:00" }],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, slot: "unspecified", durationMin: 45, origin: { date: WEEK_START, time: "07:00" } })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    const decision = result.decisions[0]!;

    expect(decision.status).toBe("moved");
    expect(decision.date).toBe(WEEK_START); // resté le même jour (créneau pm libre)
    expect(decision.incidentId).toBe("incident-1");
    expect(decision.reason).toBe("incident_reported");
  });

  it("bascule sur un autre jour uniquement si le jour d'origine n'offre plus aucun créneau", () => {
    const input = buildPlacementInput({
      calendar: [
        { weekday: 1, slot: "am", isAvailable: true, maxMinutes: null },
        { weekday: 2, slot: "am", isAvailable: true, maxMinutes: null },
      ],
      triggerReason: "incident_reported",
      incidentId: "incident-1",
      incidentWindows: [{ date: WEEK_START, fromTime: "00:00", toTime: "23:59" }], // toute la journée
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, slot: "unspecified", durationMin: 45, origin: { date: WEEK_START, time: "07:00" } })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    const decision = result.decisions[0]!;

    expect(decision.status).toBe("moved");
    expect(decision.date).toBe("2026-08-11"); // mardi
  });
});
