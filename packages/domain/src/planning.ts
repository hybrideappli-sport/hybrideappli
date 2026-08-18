/**
 * US-03 — Planning selon emploi du temps (ADR-016, ADR-017). `08-architecture.md` §14.5-§14.6,
 * `docs/db-schema.md` §11.
 *
 * Deux familles de types, volontairement séparées :
 *
 * 1. **Contrat du moteur pur** (`PlacementInput`/`PlacementDecision`/`PlacementResult`) — entrée
 *    et sortie de `placeWeekSessions()` (`@hybride/rules-engine`, hors pipeline, ADR-016 §5). La
 *    sortie ne porte AUCUN champ de contenu de séance (type, durée, charge, prescription) : c'est
 *    une propriété de TYPE, pas une vigilance de relecture — voir `placement-output-has-no-content.test.ts`.
 * 2. **Contrats HTTP/vue** (`SessionPlacementView`, `ReportIncidentInput`/`Response`,
 *    `AcknowledgeIncidentResponse`) — ce que servent les routes `/plan/week`, `/plan/today`,
 *    `/schedule/incidents`.
 *
 * Aucun de ces types n'est un artefact de `plan_versions` : `session_placements` et
 * `schedule_incidents` sont des tables F3 dédiées (ADR-016 §1), jamais `planned_sessions`.
 */

import { z } from "zod";

import type { DaySlot, IncidentResolution, MuscleGroup, PlacementReason, PlacementStatus, SessionType } from "./enums";

// ---------------------------------------------------------------------------
// `placeWeekSessions()` — entrée (`@hybride/rules-engine`, ADR-016 §5-§6)
// ---------------------------------------------------------------------------

/** Fenêtre déclarée disponible pour un jour ISO de la semaine (`availability_slots`, F1). */
export interface PlacementCalendarWindowInput {
  /** 1 = lundi … 7 = dimanche (ISO 8601). */
  weekday: number;
  slot: DaySlot;
  isAvailable: boolean;
  /** `null` ⟺ `planning.default_slot_capacity_min` s'applique. */
  maxMinutes: number | null;
}

/**
 * Fenêtre neutralisée par un imprévu OUVERT — déjà élargie de
 * `planning.incident_block_margin_min` par l'appelant (ADR-016 §3). Une par imprévu concerné par
 * la semaine placée, y compris ceux qui ne portent pas sur la séance en cours de résolution : un
 * imprévu est une indisponibilité DATÉE qui survit à toute régénération.
 */
export interface PlacementIncidentWindowInput {
  date: string; // ISO date
  fromTime: string; // 'HH:MM'
  toTime: string; // 'HH:MM'
}

/**
 * Occupation GELÉE : un placement déjà décidé ailleurs (séance passée, hors du préavis minimal,
 * ou simplement non concernée par le recalcul local en cours — ADR-016 §7). Consomme du calendrier
 * sans jamais être redécidée par cet appel.
 */
export interface PlacementFrozenOccupancyInput {
  date: string; // ISO date
  startTime: string; // 'HH:MM'
  durationMin: number;
  sessionType: SessionType;
  muscleGroups: MuscleGroup[];
}

/** Le « avant » d'une séance déjà placée au moins une fois (chaîne de supersession). */
export interface PlacementSessionOriginInput {
  date: string; // ISO date — intention du moteur, fixe pour toute la chaîne
  time: string | null; // 'HH:MM' ; null = cette séance n'a jamais eu d'horaire (jamais placée)
}

export interface PlacementSessionInput {
  sessionId: string; // planned_session_id
  /** Intention du moteur (F1) — `planned_sessions.scheduled_date`, jamais modifiée par la F3. */
  scheduledDate: string;
  slot: DaySlot;
  durationMin: number | null;
  sessionType: SessionType;
  muscleGroups: MuscleGroup[];
  orderInDay: number;
  /** `null` = tout premier placement de cette séance (reason racine `initial`/`plan_regenerated`). */
  origin: PlacementSessionOriginInput | null;
}

export type PlacementTriggerReason = Extract<PlacementReason, "initial" | "plan_regenerated" | "availability_changed" | "incident_reported">;

export interface PlacementInput {
  /** Lundi ISO de la semaine placée — aucune décision ne sort de `[weekStart, weekStart+6]`. */
  weekStart: string;
  /** Résolu par l'appelant (ADR-002) — jamais l'horloge système lue ici. */
  now: { date: string; time: string }; // 'YYYY-MM-DD' / 'HH:MM'
  /** Motif racine de CET appel — un signalement d'imprévu ne concerne qu'une séance à la fois. */
  triggerReason: PlacementTriggerReason;
  /** Imprévu résolu par CET appel, requis si et seulement si `triggerReason === 'incident_reported'`. */
  incidentId: string | null;
  calendar: PlacementCalendarWindowInput[];
  incidentWindows: PlacementIncidentWindowInput[];
  frozenOccupancy: PlacementFrozenOccupancyInput[];
  /** Séances à (re)décider par CET appel — une seule pour un imprévu (recalcul local, ADR-016 §7). */
  sessions: PlacementSessionInput[];
}

// ---------------------------------------------------------------------------
// `placeWeekSessions()` — sortie (ADR-016 §5) : AUCUN champ de contenu.
// ---------------------------------------------------------------------------

export interface PlacementDecision {
  sessionId: string;
  status: PlacementStatus;
  date: string | null; // null ⟺ cancelled_week
  startTime: string | null; // 'HH:MM'
  originDate: string;
  originTime: string | null;
  reason: PlacementReason;
  incidentId: string | null;
  /** Ids des règles ÉVALUÉES lors de la recherche de créneau (ADR-016 §6) — jamais de decision_trace. */
  guardrailsChecked: string[];
}

export interface PlacementResult {
  decisions: PlacementDecision[];
}

// ---------------------------------------------------------------------------
// Vue de placement — attachée à chaque séance servie (jour ou semaine), §14.5
// ---------------------------------------------------------------------------

export interface SessionPlacementOriginView {
  date: string;
  time: string | null; // null = jamais placée (design §4)
}

export interface SessionPlacementView {
  status: PlacementStatus;
  scheduledDate: string | null; // date EFFECTIVE ; null ⟺ cancelled_week
  scheduledTime: string | null; // 'HH:MM' ; null ⟺ cancelled_week
  origin: SessionPlacementOriginView | null; // motif « ancien → nouveau », design §1.5 ; null = rien à montrer
  reason: PlacementReason;
  note: string | null; // « Déplacée suite à un imprévu signalé. » — le « pourquoi » d'AC3
  canReportIncident: boolean; // false si passée, annulée, ou hors fenêtre de préavis
  /**
   * État (d) « Non réalisée », `11-design-notes.md` §3.4. Discriminant EXACT « automatique vs
   * déclaré » d'ADR-017 §8 : `true` ssi un `schedule_incidents` a produit CE log via la clôture
   * automatique (`closeout_outcome = 'log_created'` + `resulting_session_log_id`), jamais dérivé
   * de `session_logs.completion === 'not_done'` seul — un `not_done` saisi par l'utilisateur sans
   * imprévu ne doit jamais déclencher cet état (finding B4, revue post-`aaba499`).
   */
  isAutomaticNotDone: boolean;
}

// ---------------------------------------------------------------------------
// POST /api/v1/schedule/incidents — AC3, AC4, AC6
// ---------------------------------------------------------------------------

export const ReportIncidentInputSchema = z.object({
  plannedSessionId: z.string().uuid(),
});
export type ReportIncidentInput = z.infer<typeof ReportIncidentInputSchema>;

export interface ReportIncidentResponse {
  incidentId: string;
  outcome: IncidentResolution; // 'rescheduled' | 'cancelled_week' — 200 dans les deux cas
  placement: SessionPlacementView; // l'état d'arrivée de la carte — la réponse EST le retour UI
  message: string; // annoncé en aria-live="polite", jamais un toast
}

// ---------------------------------------------------------------------------
// POST /api/v1/schedule/incidents/:id/acknowledge — amendement ADR-017 §9
// ---------------------------------------------------------------------------

export interface AcknowledgeIncidentResponse {
  acknowledgedAt: string;
}
