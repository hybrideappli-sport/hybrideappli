import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { placeWeekSessions } from "@hybride/rules-engine";
import type { PlacementDecision, ReportIncidentResponse, Ruleset } from "@hybride/domain";

import { buildPlacementInputForIncident } from "./build-placement-input";
import { materializeSessionPlacements } from "./materialize-session-placements";
import { toSessionPlacementView, type CurrentPlacementRow } from "./read-session-placements";

const FRENCH_WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function formatFrenchDateTime(date: string, time: string): string {
  const isoWeekday = isoWeekdayOf(date);
  const [h, m] = time.split(":");
  return `${FRENCH_WEEKDAYS[isoWeekday - 1]} ${Number.parseInt(h!, 10)} h ${m}`;
}

function isoWeekdayOf(iso: string): number {
  const jsDay = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export type ResolveScheduleIncidentOutcome =
  | { kind: "not_found" }
  | { kind: "not_reportable" }
  | { kind: "already_resolved"; response: ReportIncidentResponse }
  | { kind: "resolved"; response: ReportIncidentResponse }
  | { kind: "placement_failed"; message: string };

/**
 * `resolveScheduleIncident()` — 6ᵉ orchestrateur (`08-architecture.md` §3.2). Journalise une
 * indisponibilité datée et rejoue le PLACEMENT, jamais le plan : n'écrit ni `plan_versions`, ni
 * `planned_sessions`, ni `decision_traces`. Recalcul LOCAL (ADR-016 §7) — une seule séance décidée.
 */
export async function resolveScheduleIncident(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; now: { date: string; time: string }; ruleset: Ruleset },
): Promise<ResolveScheduleIncidentOutcome> {
  const { userId, plannedSessionId, now, ruleset } = args;

  const incidentId = randomUUID();
  const built = await buildPlacementInputForIncident(admin, { userId, plannedSessionId, now, incidentId, ruleset });
  if (!built) {
    // Distingue "séance introuvable" de "non signalable" : la première n'a jamais existé (ou
    // n'appartient pas à l'utilisateur), la seconde est déjà annulée / sans placement courant.
    const { data: exists } = await admin.from("planned_sessions").select("id").eq("id", plannedSessionId).maybeSingle();
    return exists ? { kind: "not_reportable" } : { kind: "not_found" };
  }

  const { input, slotBySessionId, currentPlacement, planVersionId, weekStart, blockedWindow } = built;

  // Idempotence — index unique `schedule_incidents_one_per_placement` (ADR §14.5 point 2) : un
  // second appui sur le même placement renvoie la même résolution, jamais un second créneau bloqué.
  const { data: existingIncident, error: existingIncidentError } = await admin
    .from("schedule_incidents")
    .select("id, resolution")
    .eq("invalidated_placement_id", currentPlacement.id)
    .maybeSingle();
  if (existingIncidentError) throw new Error(`resolveScheduleIncident: schedule_incidents (idempotence) — ${existingIncidentError.message}`);
  if (existingIncident) {
    const { data: resultingPlacement, error: resultingPlacementError } = await admin
      .from("session_placements")
      .select("status, scheduled_date, scheduled_time, origin_date, origin_time, reason, incident_id")
      .eq("previous_placement_id", currentPlacement.id)
      .maybeSingle();
    if (resultingPlacementError) throw new Error(`resolveScheduleIncident: session_placements (relecture idempotence) — ${resultingPlacementError.message}`);
    if (resultingPlacement) {
      const view = toSessionPlacementView(
        {
          id: existingIncident.id,
          plannedSessionId,
          status: resultingPlacement.status,
          scheduledDate: resultingPlacement.scheduled_date,
          scheduledTime: resultingPlacement.scheduled_time,
          originDate: resultingPlacement.origin_date,
          originTime: resultingPlacement.origin_time,
          reason: resultingPlacement.reason,
          incidentId: resultingPlacement.incident_id,
        },
        now,
        ruleset,
      );
      const message =
        resultingPlacement.status === "cancelled_week"
          ? "Séance annulée cette semaine, aucun créneau disponible."
          : `Séance déplacée à ${formatFrenchDateTime(resultingPlacement.scheduled_date!, resultingPlacement.scheduled_time!)}.`;
      return { kind: "already_resolved", response: { incidentId: existingIncident.id, outcome: existingIncident.resolution, placement: view, message } };
    }
  }

  let decision: PlacementDecision;
  try {
    const result = placeWeekSessions(input, ruleset);
    const found = result.decisions[0];
    if (!found) throw new Error("aucune décision produite pour la séance signalée");
    decision = found;
  } catch (error) {
    return { kind: "placement_failed", message: error instanceof Error ? error.message : String(error) };
  }

  // `schedule_incidents` DOIT être inséré AVANT `materializeSessionPlacements()` : la nouvelle ligne
  // `session_placements` porte `incident_id`, contraint par `session_placements_incident_id_fkey` —
  // la ligne qu'elle référence doit déjà exister (finding, couverture de test Lot F2/F3 I5 : ce
  // chemin n'avait jamais été exercé, l'ordre inverse échouait systématiquement).
  const resolution = decision.status === "cancelled_week" ? "cancelled_week" : "rescheduled";
  const { error: incidentInsertError } = await admin.from("schedule_incidents").insert({
    id: incidentId,
    user_id: userId,
    reported_for_date: blockedWindow.date,
    blocked_slot: blockedWindow.blockedSlot,
    blocked_from: blockedWindow.fromTime,
    blocked_to: blockedWindow.toTime,
    planned_session_id: plannedSessionId,
    invalidated_placement_id: currentPlacement.id,
    resolution,
  });
  if (incidentInsertError) throw new Error(`resolveScheduleIncident: schedule_incidents (insert) — ${incidentInsertError.message}`);

  try {
    await materializeSessionPlacements(admin, {
      userId,
      planVersionId,
      weekStart,
      rulesetVersion: ruleset.version,
      decisions: [decision],
      slotBySessionId,
    });
  } catch (error) {
    // Action compensatoire — sans elle, un échec ici laisse l'incident orphelin de tout placement
    // (`materializeSessionPlacements()` s'exécute après l'insertion de l'incident, par contrainte de
    // FK) : l'utilisateur se retrouve verrouillé (tout signalement futur échoue en
    // `SESSION_NOT_REPORTABLE`, `invalidated_placement_id` déjà consommé) et le job de clôture peut
    // fabriquer un `not_done` sur une séance jamais concernée. On supprime l'incident tout juste
    // inséré avant de propager l'erreur, pour que l'appel soit rejouable proprement.
    const { error: deleteError } = await admin.from("schedule_incidents").delete().eq("id", incidentId);
    if (deleteError) {
      throw new Error(
        `resolveScheduleIncident: materializeSessionPlacements a échoué (${error instanceof Error ? error.message : String(error)}) ET la compensation schedule_incidents.delete a échoué (${deleteError.message})`,
      );
    }
    throw error;
  }

  const currentPlacementLike: CurrentPlacementRow = {
    id: incidentId,
    plannedSessionId,
    status: decision.status,
    scheduledDate: decision.date,
    scheduledTime: decision.startTime,
    originDate: decision.originDate,
    originTime: decision.originTime,
    reason: decision.reason,
    incidentId: decision.incidentId,
  };
  const placement = toSessionPlacementView(currentPlacementLike, now, ruleset);
  const message =
    decision.status === "cancelled_week"
      ? "Séance annulée cette semaine, aucun créneau disponible."
      : `Séance déplacée à ${formatFrenchDateTime(decision.date!, decision.startTime!)}.`;

  return { kind: "resolved", response: { incidentId, outcome: resolution, placement, message } };
}
