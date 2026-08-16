/**
 * Arithmétique de calendrier PURE pour `placeWeekSessions()` (ADR-016 §5-§6). Aucune horloge
 * système, aucune I/O — les mêmes contraintes que `lib/dates.ts`, étendues aux heures (`HH:MM`).
 */

import type { DaySlot, PlacementCalendarWindowInput, PlanningParams } from "@hybride/domain";
import { addDays } from "../lib/dates";

/** Une fenêtre déclarée disponible pour une date donnée, en minutes depuis minuit. */
export interface DeclaredWindow {
  slot: DaySlot;
  startMin: number;
  endMin: number;
  capacityMin: number;
}

/** Un intervalle occupé (imprévu ou occupation gelée), en minutes depuis minuit — même date. */
export interface BlockedInterval {
  startMin: number;
  endMin: number;
}

export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Les 7 dates ISO `[weekStart, weekStart+6]`, dans l'ordre lundi → dimanche. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Fenêtres déclarées disponibles pour chaque date de la semaine, dérivées de
 * `availability_slots` (weekday × slot) et des bornes `planning.slot_windows`. Une ligne
 * `is_available = false`, ou l'absence de ligne pour un (weekday, slot) donné, ne produit AUCUNE
 * fenêtre — AC1 : "aucune séance n'est positionnée sur un créneau marqué indisponible".
 */
export function buildWeekCalendar(
  weekStart: string,
  calendar: PlacementCalendarWindowInput[],
  planning: PlanningParams,
): Map<string, DeclaredWindow[]> {
  const dates = weekDates(weekStart);
  const result = new Map<string, DeclaredWindow[]>();

  for (const [index, date] of dates.entries()) {
    const isoWeekday = index + 1; // dates[0] = weekStart = lundi = 1
    const windows: DeclaredWindow[] = [];
    for (const entry of calendar) {
      if (entry.weekday !== isoWeekday || !entry.isAvailable) continue;
      const bounds = planning.slot_windows[entry.slot];
      const startMin = parseTime(bounds.start);
      const endMin = parseTime(bounds.end);
      if (endMin <= startMin) continue; // défensif — fenêtre dégénérée, jamais produite par un ruleset valide
      windows.push({
        slot: entry.slot,
        startMin,
        endMin,
        capacityMin: entry.maxMinutes ?? planning.default_slot_capacity_min,
      });
    }
    result.set(date, windows);
  }
  return result;
}

/** `true` si les deux intervalles `[aStart, aEnd)` / `[bStart, bEnd)` se chevauchent. */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
