import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { PlacementReason, PlacementStatus, Ruleset, SessionPlacementView } from "@hybride/domain";

/**
 * Lectures du placement COURANT (`session_placements`, `superseded_at is null`) — utilisées par
 * `GET /plan/today`, `GET /plan/week` et le Dashboard (AC5 : une seule lecture, aucune route
 * dupliquée, `08-architecture.md` §14.5). Volontairement séparé de `materialize-session-placements.ts`
 * (le SEUL chemin d'ÉCRITURE, ADR-016 §2) : ce module ne fait QUE lire.
 */

export interface CurrentPlacementRow {
  id: string;
  plannedSessionId: string;
  status: PlacementStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  originDate: string;
  originTime: string | null;
  reason: PlacementReason;
  incidentId: string | null;
}

/** Placement(s) courant(s) pour un ensemble de séances prévues (`planned_session_id in (...)`). */
export async function fetchCurrentPlacementsBySessionId(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionIds: string[] },
): Promise<Map<string, CurrentPlacementRow>> {
  const { userId, plannedSessionIds } = args;
  const byId = new Map<string, CurrentPlacementRow>();
  if (plannedSessionIds.length === 0) return byId;

  const { data, error } = await admin
    .from("session_placements")
    .select("id, planned_session_id, status, scheduled_date, scheduled_time, origin_date, origin_time, reason, incident_id")
    .eq("user_id", userId)
    .in("planned_session_id", plannedSessionIds)
    .is("superseded_at", null);
  if (error) throw new Error(`fetchCurrentPlacementsBySessionId: session_placements — ${error.message}`);

  for (const row of data ?? []) {
    byId.set(row.planned_session_id, {
      id: row.id,
      plannedSessionId: row.planned_session_id,
      status: row.status,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      originDate: row.origin_date,
      originTime: row.origin_time,
      reason: row.reason,
      incidentId: row.incident_id,
    });
  }
  return byId;
}

export async function fetchCurrentPlacementBySessionId(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string },
): Promise<CurrentPlacementRow | null> {
  const rows = await fetchCurrentPlacementsBySessionId(admin, { userId: args.userId, plannedSessionIds: [args.plannedSessionId] });
  return rows.get(args.plannedSessionId) ?? null;
}

/** `true` si le créneau (date, heure) est encore à au moins `min_lead_time_min` de `now`. */
function isWithinReportableWindow(row: CurrentPlacementRow, now: { date: string; time: string }, minLeadTimeMin: number): boolean {
  if (row.status === "cancelled_week" || !row.scheduledDate || !row.scheduledTime) return false;
  if (row.scheduledDate < now.date) return false;
  if (row.scheduledDate > now.date) return true;
  const [nowH, nowM] = now.time.split(":").map((v) => Number.parseInt(v, 10));
  const [schedH, schedM] = row.scheduledTime.split(":").map((v) => Number.parseInt(v, 10));
  const nowMin = (nowH ?? 0) * 60 + (nowM ?? 0);
  const schedMin = (schedH ?? 0) * 60 + (schedM ?? 0);
  return schedMin >= nowMin + minLeadTimeMin;
}

/**
 * `PlacementDecision`/`CurrentPlacementRow` → `SessionPlacementView` — la vue servie par
 * `/plan/today`, `/plan/week` et le Dashboard. Le contrat exact est en `08-architecture.md` §14.5.
 */
export function toSessionPlacementView(row: CurrentPlacementRow, now: { date: string; time: string }, ruleset: Ruleset): SessionPlacementView {
  const note =
    row.status === "moved" && row.reason === "incident_reported"
      ? "Déplacée suite à un imprévu signalé."
      : row.status === "cancelled_week"
        ? "Aucun créneau disponible cette semaine."
        : null;

  return {
    status: row.status,
    scheduledDate: row.scheduledDate,
    scheduledTime: row.scheduledTime,
    origin: row.status === "scheduled" ? null : { date: row.originDate, time: row.originTime },
    reason: row.reason,
    note,
    canReportIncident: isWithinReportableWindow(row, now, ruleset.params.planning.min_lead_time_min),
  };
}
