/**
 * `placeWeekSessions()` — ADR-016 §5-§6, `08-architecture.md` §14.6.
 *
 * Fonction PURE, HORS des 12 étapes du pipeline `generatePlan()` et appelée par aucune d'elles —
 * statut identique à `computeHybridScore()` (ADR-014 §6). Elle vit néanmoins dans
 * `@hybride/rules-engine`, et pas dans `apps/web`, pour une seule raison : elle doit revérifier des
 * garde-fous de sécurité déjà implémentés (`isIntenseSessionType`, espacement d'interférence AC10,
 * jours consécutifs sans repos AC8) — les réimplémenter côté application dupliquerait de la
 * logique de sécurité (ADR-016 §5).
 *
 * Le type de sortie (`PlacementDecision`) ne porte AUCUN champ de contenu (type de séance, durée,
 * charge, prescription) : **l'AC3 (« le contenu de la séance reste strictement inchangé ») est une
 * propriété de TYPE, pas une vigilance de relecture** — voir `placement-output-has-no-content.test.ts`.
 *
 * Quatre propriétés à préserver à chaque modification de ce fichier (ADR-016 §6) :
 *  - jamais un placement en dehors de `[weekStart, weekStart+6]` (`reschedule_scope = 'current_week'`,
 *    corollaire technique du refus de report cumulatif, AC4) ;
 *  - recalcul LOCAL, jamais une réoptimisation globale : cette fonction ne fait que placer les
 *    séances listées dans `input.sessions` — les autres (`input.frozenOccupancy`) ne sont jamais
 *    redécidées, seulement consommées comme occupation ;
 *  - les garde-fous sont REVÉRIFIÉS, jamais recalculés : aucun seuil n'est redéfini ici ;
 *  - déterminisme total : pas d'horloge interne, pas d'aléatoire, départages explicites.
 */

import type { MuscleGroup, PlacementDecision, PlacementInput, PlacementResult, PlacementSessionInput, PlacementSessionOriginInput, Ruleset, SessionType } from "@hybride/domain";
import { buildWeekCalendar, formatTime, intervalsOverlap, parseTime } from "./calendar";
import { candidateStartTimes, sortCandidates, type PlacementCandidate } from "./candidates";
import { ALL_GUARDRAIL_IDS, passesGuardrails, type OccupiedSession } from "./guardrail-filters";

interface WorkingOccupancy extends OccupiedSession {
  isIncidentBlock?: boolean;
}

function orderSessions(sessions: PlacementSessionInput[]): PlacementSessionInput[] {
  return [...sessions].sort((a, b) => {
    if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate < b.scheduledDate ? -1 : 1;
    if (a.orderInDay !== b.orderInDay) return a.orderInDay - b.orderInDay;
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
  });
}

function endMinFor(durationMin: number | null, startMin: number): number {
  return startMin + Math.max(0, durationMin ?? 0);
}

export function placeWeekSessions(input: PlacementInput, ruleset: Ruleset): PlacementResult {
  const planning = ruleset.params.planning;
  const calendarByDate = buildWeekCalendar(input.weekStart, input.calendar, planning);

  // Fenêtres neutralisées par un imprévu OUVERT, groupées par date (déjà élargies par l'appelant,
  // ADR-016 §3). Consultées à part de `occupied` : elles bloquent un candidat sans compter comme
  // une séance pour `max_sessions_per_day`/`min_minutes_between_sessions_same_day`.
  const incidentsByDate = new Map<string, { startMin: number; endMin: number }[]>();
  for (const window of input.incidentWindows) {
    const list = incidentsByDate.get(window.date) ?? [];
    list.push({ startMin: parseTime(window.fromTime), endMin: parseTime(window.toTime) });
    incidentsByDate.set(window.date, list);
  }

  const occupied: WorkingOccupancy[] = input.frozenOccupancy.map((entry) => ({
    date: entry.date,
    startMin: parseTime(entry.startTime),
    endMin: parseTime(entry.startTime) + entry.durationMin,
    sessionType: entry.sessionType,
    muscleGroups: entry.muscleGroups,
  }));

  const decisions: PlacementDecision[] = [];

  for (const session of orderSessions(input.sessions)) {
    const durationMin = Math.max(0, session.durationMin ?? 0);

    const rawCandidates: PlacementCandidate[] = [];
    for (const [date, windows] of calendarByDate.entries()) {
      const matchingWindows = session.slot === "unspecified" ? windows : windows.filter((w) => w.slot === session.slot);
      for (const window of matchingWindows) {
        for (const startMin of candidateStartTimes(window, durationMin, planning.grid_minutes)) {
          const endMin = endMinFor(session.durationMin, startMin);
          const blockedByIncident = (incidentsByDate.get(date) ?? []).some((incident) => intervalsOverlap(startMin, endMin, incident.startMin, incident.endMin));
          if (blockedByIncident) continue;
          rawCandidates.push({ date, slot: window.slot, startMin });
        }
      }
    }

    const validCandidates = rawCandidates.filter((candidate) =>
      passesGuardrails(
        { date: candidate.date, startMin: candidate.startMin, endMin: endMinFor(session.durationMin, candidate.startMin), sessionType: session.sessionType, muscleGroups: session.muscleGroups },
        input.now,
        occupied,
        ruleset,
      ),
    );

    const sorted = sortCandidates(validCandidates, session.scheduledDate, planning.preferred_start_times);
    const chosen = sorted[0] ?? null;

    const origin: PlacementSessionOriginInput = session.origin ?? { date: session.scheduledDate, time: chosen ? formatTime(chosen.startMin) : null };

    let decision: PlacementDecision;
    if (!chosen) {
      decision = {
        sessionId: session.sessionId,
        status: "cancelled_week",
        date: null,
        startTime: null,
        originDate: origin.date,
        originTime: origin.time,
        reason: "no_slot_available",
        incidentId: input.triggerReason === "incident_reported" ? input.incidentId : null,
        guardrailsChecked: ALL_GUARDRAIL_IDS,
      };
    } else {
      const startTime = formatTime(chosen.startMin);
      const status = chosen.date === origin.date && startTime === origin.time ? "scheduled" : "moved";
      decision = {
        sessionId: session.sessionId,
        status,
        date: chosen.date,
        startTime,
        originDate: origin.date,
        originTime: origin.time,
        reason: input.triggerReason,
        incidentId: input.triggerReason === "incident_reported" ? input.incidentId : null,
        guardrailsChecked: ALL_GUARDRAIL_IDS,
      };
      occupied.push({
        date: chosen.date,
        startMin: chosen.startMin,
        endMin: endMinFor(session.durationMin, chosen.startMin),
        sessionType: session.sessionType,
        muscleGroups: session.muscleGroups,
      });
    }

    decisions.push(decision);
  }

  return { decisions };
}

// Réexportés pour les tests unitaires ciblés (candidats/occupation), sans dupliquer la logique.
export type { MuscleGroup, SessionType };
