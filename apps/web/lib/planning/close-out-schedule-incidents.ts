import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { IncidentCloseoutOutcome } from "@hybride/domain";

import { finalizeSessionLogLoad } from "../data/finalize-session-log-load";
import { isHealthConsentActive } from "../orchestration/health-consent-status";
import { fetchCurrentPlacementBySessionId } from "./read-session-placements";

/**
 * `closeOutScheduleIncidents()` — job `schedule_closeout` (ADR-017). Écrit le réalisé, jamais le
 * plan : **n'importe ni `applyDailyLog`, ni `regeneratePlan`** — décision du fondateur (« événement
 * temporel, jamais un ajustement de charge ») devenue une propriété du chemin de code.
 *
 * Quatre issues, toutes journalisées (`schedule_incidents.closeout_outcome`) — jamais un effet de
 * bord silencieux.
 */

const NOT_DONE_REASON: Record<"rescheduled" | "cancelled_week", string> = {
  cancelled_week: "Créneau signalé indisponible, séance non replacée cette semaine.",
  rescheduled: "Séance déplacée après un imprévu, non réalisée à son nouvel horaire.",
};

export interface CloseOutResult {
  incidentId: string;
  outcome: IncidentCloseoutOutcome;
}

/** Un imprévu OUVERT dont la fenêtre de clôture (date de destination, ou `reported_for_date` de repli) est atteinte. */
async function fetchDueIncidents(admin: SupabaseClient<Database>, userId: string, localDate: string) {
  const { data, error } = await admin
    .from("schedule_incidents")
    .select("id, resolution, reported_for_date, planned_session_id")
    .eq("user_id", userId)
    .is("closed_out_at", null);
  if (error) throw new Error(`closeOutScheduleIncidents: schedule_incidents — ${error.message}`);

  const due: { id: string; resolution: "rescheduled" | "cancelled_week"; closureDate: string; plannedSessionId: string | null }[] = [];
  for (const incident of data ?? []) {
    const currentPlacement = incident.planned_session_id
      ? await fetchCurrentPlacementBySessionId(admin, { userId, plannedSessionId: incident.planned_session_id })
      : null;
    const closureDate =
      currentPlacement && currentPlacement.status !== "cancelled_week" && currentPlacement.scheduledDate ? currentPlacement.scheduledDate : incident.reported_for_date;
    if (closureDate <= localDate) {
      due.push({ id: incident.id, resolution: incident.resolution, closureDate, plannedSessionId: incident.planned_session_id });
    }
  }
  return due;
}

async function hasNonExcludedLogOnDate(admin: SupabaseClient<Database>, userId: string, date: string): Promise<boolean> {
  const { data, error } = await admin.from("session_logs").select("id").eq("user_id", userId).eq("logged_date", date).is("excluded_at", null).limit(1).maybeSingle();
  if (error) throw new Error(`closeOutScheduleIncidents: session_logs (garde anti double-comptage) — ${error.message}`);
  return data !== null;
}

/**
 * `séance absente de la version active` (ADR-017 §3) : ni placement courant retrouvable pour la
 * séance, ni appartenance à la version de plan actuellement active — le moteur a reprojeté la
 * semaine, il n'y a plus de séance à déclarer non réalisée.
 */
async function isSessionAbsentFromActivePlan(admin: SupabaseClient<Database>, userId: string, plannedSessionId: string | null): Promise<boolean> {
  if (!plannedSessionId) return true;
  const { data: session, error: sessionError } = await admin.from("planned_sessions").select("plan_version_id").eq("id", plannedSessionId).maybeSingle();
  if (sessionError) throw new Error(`closeOutScheduleIncidents: planned_sessions — ${sessionError.message}`);
  if (!session) return true;

  const { data: activePlan, error: activePlanError } = await admin.from("plans").select("current_version_id").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (activePlanError) throw new Error(`closeOutScheduleIncidents: plans — ${activePlanError.message}`);

  return activePlan?.current_version_id !== session.plan_version_id;
}

export async function closeOutScheduleIncidents(admin: SupabaseClient<Database>, args: { userId: string; localDate: string }): Promise<CloseOutResult[]> {
  const { userId, localDate } = args;
  const due = await fetchDueIncidents(admin, userId, localDate);
  const results: CloseOutResult[] = [];

  for (const incident of due) {
    const outcome = await closeOutOne(admin, { userId, incident });
    results.push({ incidentId: incident.id, outcome });
  }
  return results;
}

async function closeOutOne(
  admin: SupabaseClient<Database>,
  args: { userId: string; incident: { id: string; resolution: "rescheduled" | "cancelled_week"; closureDate: string; plannedSessionId: string | null } },
): Promise<IncidentCloseoutOutcome> {
  const { userId, incident } = args;
  const now = new Date().toISOString();

  if (await hasNonExcludedLogOnDate(admin, userId, incident.closureDate)) {
    await admin.from("schedule_incidents").update({ closeout_outcome: "already_logged", closed_out_at: now }).eq("id", incident.id);
    return "already_logged";
  }

  if (await isSessionAbsentFromActivePlan(admin, userId, incident.plannedSessionId)) {
    const currentPlacement = incident.plannedSessionId ? await fetchCurrentPlacementBySessionId(admin, { userId, plannedSessionId: incident.plannedSessionId }) : null;
    if (!currentPlacement) {
      await admin.from("schedule_incidents").update({ closeout_outcome: "skipped_session_absent", closed_out_at: now }).eq("id", incident.id);
      return "skipped_session_absent";
    }
  }

  if (!(await isHealthConsentActive(admin, userId))) {
    await admin.from("schedule_incidents").update({ closeout_outcome: "skipped_no_consent", closed_out_at: now }).eq("id", incident.id);
    return "skipped_no_consent";
  }

  const { data: insertedLog, error: insertError } = await admin
    .from("session_logs")
    .insert({
      user_id: userId,
      planned_session_id: incident.plannedSessionId,
      logged_date: incident.closureDate,
      completion: "not_done",
      not_done_reason: NOT_DONE_REASON[incident.resolution],
      source: "declared",
      pain: "none",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`closeOutScheduleIncidents: session_logs (insert) — ${insertError.message}`);

  await finalizeSessionLogLoad(admin, { logId: insertedLog.id, userId });

  await admin
    .from("schedule_incidents")
    .update({ closeout_outcome: "log_created", closed_out_at: now, resulting_session_log_id: insertedLog.id })
    .eq("id", incident.id);

  return "log_created";
}
