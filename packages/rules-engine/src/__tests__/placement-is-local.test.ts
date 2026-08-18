/**
 * Un imprévu ne déplace QUE la séance concernée ; les autres placements sont gelés, jamais
 * redécidés — ADR-016 §7 (recalcul local, jamais une réoptimisation globale de la semaine).
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

describe("placeWeekSessions — ADR-016 §7, recalcul local", () => {
  it("ne produit une décision QUE pour la séance transmise dans `input.sessions` — les gelées n'apparaissent jamais en sortie", () => {
    const input = buildPlacementInput({
      calendar: [
        { weekday: 1, slot: "am", isAvailable: true, maxMinutes: null },
        { weekday: 2, slot: "am", isAvailable: true, maxMinutes: null },
      ],
      triggerReason: "incident_reported",
      incidentId: "incident-1",
      incidentWindows: [{ date: WEEK_START, fromTime: "05:00", toTime: "09:00" }],
      // Deux autres séances de la semaine sont GELÉES (déjà placées ailleurs) : elles ne sont
      // transmises que comme occupation, jamais comme séance à décider.
      frozenOccupancy: [
        { date: "2026-08-11", startTime: "07:00", durationMin: 45, sessionType: "endurance", muscleGroups: ["quads"] },
        { date: "2026-08-13", startTime: "18:30", durationMin: 45, sessionType: "strength", muscleGroups: ["back"] },
      ],
      sessions: [buildSession({ sessionId: "s-incident", scheduledDate: WEEK_START, slot: "unspecified", durationMin: 30, origin: { date: WEEK_START, time: "07:00" } })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);

    // Une seule décision produite — jamais une par séance de la semaine.
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]!.sessionId).toBe("s-incident");
  });

  it("ne place jamais la séance concernée sur un créneau déjà occupé par une séance gelée", () => {
    const input = buildPlacementInput({
      calendar: [{ weekday: 1, slot: "am", isAvailable: true, maxMinutes: 120 }],
      triggerReason: "incident_reported",
      incidentId: "incident-1",
      incidentWindows: [],
      frozenOccupancy: [{ date: WEEK_START, startTime: "07:00", durationMin: 60, sessionType: "endurance", muscleGroups: ["quads"] }],
      sessions: [buildSession({ sessionId: "s-incident", scheduledDate: WEEK_START, slot: "am", durationMin: 30, origin: { date: WEEK_START, time: "07:00" } })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    const decision = result.decisions[0]!;
    if (decision.status !== "cancelled_week") {
      // Le nouveau créneau ne doit jamais chevaucher [07:00, 08:00) de la séance gelée.
      const startsBefore = decision.startTime! < "07:00" && addMinutes(decision.startTime!, 30) <= "07:00";
      const startsAfter = decision.startTime! >= "08:00";
      expect(startsBefore || startsAfter).toBe(true);
    }
  });
});

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map((v) => Number.parseInt(v, 10));
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
