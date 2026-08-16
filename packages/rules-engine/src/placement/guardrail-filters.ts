/**
 * Garde-fous REVÉRIFIÉS à chaque candidat — jamais recalculés (ADR-016 §8, fiche US-03 §5 : « F3
 * ne les recalcule pas, elle doit s'assurer que le nouveau placement ne les viole pas »). Mêmes
 * seuils que le pipeline F1 (`guardrails.max_consecutive_days_without_rest`,
 * `interference.min_hours_between_intense_and_strength_same_groups`), plus les paramètres de
 * densité journalière propres à `planning` (ADR-016 §4).
 */

import type { MuscleGroup, Ruleset, SessionType } from "@hybride/domain";
import { diffDays } from "../lib/dates";
import { isIntenseSessionType } from "../lib/guardrail-helpers";
import { intervalsOverlap } from "./calendar";

/** Emprunté à `pipeline/08-resolve-interference.ts` — même repli documenté, même valeur. */
const FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH = 48;

export interface OccupiedSession {
  date: string;
  startMin: number;
  endMin: number;
  sessionType: SessionType;
  muscleGroups: MuscleGroup[];
}

export interface GuardrailCandidate {
  date: string;
  startMin: number;
  endMin: number;
  sessionType: SessionType;
  muscleGroups: MuscleGroup[];
}

export const GUARDRAIL_IDS = {
  minLeadTime: "planning.min_lead_time_min",
  noOverlap: "planning.no_overlap",
  maxSessionsPerDay: "planning.max_sessions_per_day",
  minMinutesBetweenSessionsSameDay: "planning.min_minutes_between_sessions_same_day",
  noTwoIntenseSameDay: "planning.allow_two_intense_sessions_same_day",
  maxConsecutiveDaysWithoutRest: "guardrails.max_consecutive_days_without_rest",
  interferenceSpacing: "interference.min_hours_between_intense_and_strength_same_groups",
} as const;

/** Liste ordonnée des ids de règles ÉVALUÉES — persistée dans `guardrails_checked` (ADR-016 §6). */
export const ALL_GUARDRAIL_IDS: string[] = Object.values(GUARDRAIL_IDS);

function sharesMuscleGroup(a: MuscleGroup[], b: MuscleGroup[]): boolean {
  return a.some((group) => group !== "none" && b.includes(group));
}

/** `true` si le candidat respecte TOUS les garde-fous revérifiés, compte tenu de l'occupation. */
export function passesGuardrails(candidate: GuardrailCandidate, now: { date: string; time: string }, occupied: OccupiedSession[], ruleset: Ruleset): boolean {
  const params = ruleset.params.planning;

  // 1. Jamais dans le passé, jamais "dans 10 minutes" (ADR-016 §7).
  if (diffDays(now.date, candidate.date) < 0) return false;
  if (candidate.date === now.date) {
    const [nowH, nowM] = now.time.split(":").map((v) => Number.parseInt(v, 10));
    const nowMin = (nowH ?? 0) * 60 + (nowM ?? 0);
    if (candidate.startMin < nowMin + params.min_lead_time_min) return false;
  }

  const sameDay = occupied.filter((o) => o.date === candidate.date);

  // 2. Jamais de chevauchement direct avec une occupation existante (imprévu, gel, autre séance).
  for (const other of sameDay) {
    if (intervalsOverlap(candidate.startMin, candidate.endMin, other.startMin, other.endMin)) return false;
  }

  // 3. Densité journalière — `max_sessions_per_day`.
  if (params.max_sessions_per_day !== null && sameDay.length + 1 > params.max_sessions_per_day) return false;

  // 4. Espacement minimal entre deux séances du même jour.
  if (params.min_minutes_between_sessions_same_day !== null) {
    for (const other of sameDay) {
      const gap = candidate.startMin >= other.endMin ? candidate.startMin - other.endMin : other.startMin - candidate.endMin;
      if (gap < params.min_minutes_between_sessions_same_day) return false;
    }
  }

  // 5. Jamais deux séances intenses le même jour, sauf autorisation explicite du ruleset.
  if (!params.allow_two_intense_sessions_same_day && isIntenseSessionType(candidate.sessionType)) {
    if (sameDay.some((o) => isIntenseSessionType(o.sessionType))) return false;
  }

  // 6. Espacement intense / force sur les mêmes groupes musculaires (AC10, hérité de F1).
  const configuredHours = ruleset.params.interference.min_hours_between_intense_and_strength_same_groups;
  const minInterferenceMinutes = (configuredHours ?? FALLBACK_MIN_HOURS_BETWEEN_INTENSE_AND_STRENGTH) * 60;
  const candidateIsIntense = isIntenseSessionType(candidate.sessionType);
  const candidateIsStrength = candidate.sessionType === "strength";
  if (candidateIsIntense || candidateIsStrength) {
    for (const other of occupied) {
      const otherIsIntense = isIntenseSessionType(other.sessionType);
      const otherIsStrength = other.sessionType === "strength";
      const pairIsIntenseAndStrength = (candidateIsIntense && otherIsStrength) || (candidateIsStrength && otherIsIntense);
      if (!pairIsIntenseAndStrength) continue;
      if (!sharesMuscleGroup(candidate.muscleGroups, other.muscleGroups)) continue;
      const gapMinutes = minutesBetween(candidate.date, candidate.startMin, candidate.endMin, other.date, other.startMin, other.endMin);
      if (gapMinutes < minInterferenceMinutes) return false;
    }
  }

  // 7. Maximum de jours consécutifs sans repos — même logique que `applyHardGuardrails` (étape 11
  //    du pipeline F1), appliquée ici à l'ensemble des dates OCCUPÉES fournies par l'appelant (qui
  //    peut inclure des séances gelées de semaines adjacentes pour couvrir une fenêtre à cheval,
  //    ADR-016 §6 — sinon limité aux dates connues de cet appel).
  const maxConsecutive = ruleset.params.guardrails.max_consecutive_days_without_rest;
  if (maxConsecutive !== null) {
    const trainingDates = new Set(occupied.map((o) => o.date));
    trainingDates.add(candidate.date);
    if (longestConsecutiveRun(trainingDates) > maxConsecutive) return false;
  }

  return true;
}

function minutesBetween(dateA: string, startA: number, endA: number, dateB: string, startB: number, endB: number): number {
  const dayOffsetMinutes = diffDays(dateA, dateB) * 24 * 60;
  const absoluteStartB = dayOffsetMinutes + startB;
  const absoluteEndB = dayOffsetMinutes + endB;
  if (absoluteStartB >= endA) return absoluteStartB - endA;
  if (startA >= absoluteEndB) return startA - absoluteEndB;
  return 0; // chevauchement — déjà rejeté par ailleurs si même jour, sinon négligeable ici
}

function longestConsecutiveRun(dates: Set<string>): number {
  const sorted = Array.from(dates).sort();
  let longest = 0;
  let runStart = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const brokeRun = i === sorted.length || diffDays(sorted[i - 1]!, sorted[i]!) > 1;
    if (brokeRun) {
      longest = Math.max(longest, i - runStart);
      runStart = i;
    }
  }
  return longest;
}
