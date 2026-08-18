/**
 * AC1 — aucune séance placée sur un créneau `is_available = false`, ni hors des `slot_windows`.
 */

import { describe, expect, it } from "vitest";
import { placeWeekSessions } from "../placement/place-week-sessions";
import { buildPlacementInput, buildSession, RULESET_FOR_PLACEMENT, WEEK_START } from "../../__fixtures__/placement";

describe("placeWeekSessions — AC1, respect des disponibilités", () => {
  it("ne place jamais une séance sur un jour totalement indisponible", () => {
    // Aucune disponibilité déclarée du tout : `calendar` vide.
    const input = buildPlacementInput({
      calendar: [],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]).toMatchObject({ status: "cancelled_week", date: null, startTime: null, reason: "no_slot_available" });
  });

  it("ne place jamais une séance sur un créneau explicitement marqué indisponible", () => {
    // Mardi (weekday=2) : PM disponible, AM explicitement indisponible.
    const input = buildPlacementInput({
      calendar: [
        { weekday: 2, slot: "am", isAvailable: false, maxMinutes: null },
        { weekday: 2, slot: "pm", isAvailable: true, maxMinutes: null },
      ],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: "2026-08-11", slot: "am" })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);

    // La séance demande explicitement le créneau `am`, indisponible ce jour-là : aucun candidat
    // sur `am`, et le slot `pm` ne "comble" pas une demande de slot explicite.
    expect(result.decisions[0]!.status).toBe("cancelled_week");
  });

  it("place systématiquement à l'intérieur des bornes de `slot_windows`", () => {
    const input = buildPlacementInput({
      calendar: [{ weekday: 1, slot: "am", isAvailable: true, maxMinutes: null }],
      sessions: [buildSession({ sessionId: "s1", scheduledDate: WEEK_START, slot: "am", durationMin: 30 })],
    });

    const result = placeWeekSessions(input, RULESET_FOR_PLACEMENT);
    const decision = result.decisions[0]!;
    expect(decision.status).not.toBe("cancelled_week");
    expect(decision.startTime! >= "06:30").toBe(true);
    expect(decision.startTime! <= "11:30").toBe(true);
  });
});
