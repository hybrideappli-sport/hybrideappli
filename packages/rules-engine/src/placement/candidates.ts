/**
 * Génération et tri des candidats horaires — ADR-016 §5-§6, `08-architecture.md` §14.6 étape 5.
 */

import type { DaySlot, PlanningParams } from "@hybride/domain";
import type { DeclaredWindow } from "./calendar";
import { diffDays } from "../lib/dates";
import { parseTime } from "./calendar";

export interface PlacementCandidate {
  date: string;
  slot: DaySlot;
  startMin: number;
}

/**
 * Débuts possibles, alignés sur la grille `planning.grid_minutes` À PARTIR DU DÉBUT DE LA FENÊTRE
 * DÉCLARÉE (jamais de minuit) — un créneau `pm` commençant à 16h30 ne propose donc jamais 16h45.
 * Aucun candidat si la durée de la séance dépasse la capacité déclarée de la fenêtre (`max_minutes`,
 * AC1 : « une séance de 90 min n'entre pas dans un créneau de 45 »).
 */
export function candidateStartTimes(window: DeclaredWindow, durationMin: number, gridMinutes: number): number[] {
  if (durationMin > window.capacityMin) return [];
  const starts: number[] = [];
  for (let start = window.startMin; start + durationMin <= window.endMin; start += gridMinutes) {
    starts.push(start);
  }
  return starts;
}

/**
 * Tri des candidats — étape 5c de `08-architecture.md` §14.6, dans cet ordre :
 *  1. même jour que l'intention du moteur d'abord (AC3 : « un autre horaire le même jour ») ;
 *  2. écart de jours croissant par rapport à l'intention, à l'intérieur de la semaine ISO ;
 *  3. rang dans `preferred_start_times` (lisibilité — 07h00 plutôt que 06h30 systématique) ;
 *  4. heure croissante.
 */
export function sortCandidates(candidates: PlacementCandidate[], intentionDate: string, preferredStartTimes: PlanningParams["preferred_start_times"]): PlacementCandidate[] {
  function preferredRank(candidate: PlacementCandidate): number {
    const preferences = preferredStartTimes[candidate.slot];
    const time = formatMinutes(candidate.startMin);
    const index = preferences.indexOf(time);
    return index === -1 ? preferences.length : index;
  }

  return [...candidates].sort((a, b) => {
    const dayOffsetA = Math.abs(diffDays(intentionDate, a.date));
    const dayOffsetB = Math.abs(diffDays(intentionDate, b.date));
    if (dayOffsetA !== dayOffsetB) return dayOffsetA - dayOffsetB;
    const rankA = preferredRank(a);
    const rankB = preferredRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.startMin - b.startMin;
  });
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Ré-exporté pour les appelants qui n'ont besoin que du parsing (évite un import croisé inutile). */
export { parseTime };
