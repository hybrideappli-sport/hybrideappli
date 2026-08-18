/**
 * Fixtures pour les tests de `placeWeekSessions()` (ADR-016). Semaine ISO fixe, lundi
 * `2026-08-10` (`2026-W33`), pour que tous les tests raisonnent sur le même calendrier.
 */

import type {
  PlacementCalendarWindowInput,
  PlacementFrozenOccupancyInput,
  PlacementInput,
  PlacementSessionInput,
  Ruleset,
} from "@hybride/domain";
import { TEST_RULESET } from "./ruleset";

export const WEEK_START = "2026-08-10"; // lundi

export const RULESET_FOR_PLACEMENT: Ruleset = TEST_RULESET;

/** Disponibilité "confortable" : tous les jours, matin ET soir, aucune indisponibilité. */
export function buildFullWeekCalendar(): PlacementCalendarWindowInput[] {
  const windows: PlacementCalendarWindowInput[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    windows.push({ weekday, slot: "am", isAvailable: true, maxMinutes: null });
    windows.push({ weekday, slot: "pm", isAvailable: true, maxMinutes: null });
  }
  return windows;
}

export function buildSession(overrides: Partial<PlacementSessionInput> & { sessionId: string; scheduledDate: string }): PlacementSessionInput {
  return {
    slot: "unspecified",
    durationMin: 45,
    sessionType: "endurance",
    muscleGroups: ["quads", "hamstrings"],
    orderInDay: 1,
    origin: null,
    ...overrides,
  };
}

export function buildFrozenOccupancy(overrides: Partial<PlacementFrozenOccupancyInput> & { date: string; startTime: string }): PlacementFrozenOccupancyInput {
  return {
    durationMin: 45,
    sessionType: "endurance",
    muscleGroups: ["quads", "hamstrings"],
    ...overrides,
  };
}

export function buildPlacementInput(overrides: Partial<PlacementInput> = {}): PlacementInput {
  return {
    weekStart: WEEK_START,
    now: { date: WEEK_START, time: "06:00" },
    triggerReason: "initial",
    incidentId: null,
    calendar: buildFullWeekCalendar(),
    incidentWindows: [],
    frozenOccupancy: [],
    sessions: [],
    ...overrides,
  };
}
