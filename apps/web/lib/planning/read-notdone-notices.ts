import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { IncidentResolution } from "@hybride/domain";

/**
 * `readNotDoneNotices()` — lecture serveur, JAMAIS exposée en HTTP (`08-architecture.md` §14.5,
 * amendement ADR-017 §8-§9). Alimente `D-notdone-notice` sur le Dashboard, au même titre que
 * `fetchWeekPlan()` : une lecture de plus dupliquerait une source de vérité pour rien.
 *
 * Le discriminant « automatique vs déclaré » EST `schedule_incidents.resulting_session_log_id`
 * (ADR-017 §8) : jamais `not_done_reason`, texte libre réécrivable par l'utilisateur.
 */

/** Fenêtre de PRÉSENTATION (design §3.1) — pas un paramètre de ruleset (ADR-007 §1 : `rulesets.params` ne porte que les paramètres du moteur). */
export const NOT_DONE_NOTICE_WINDOW_HOURS = 48;

export interface NotDoneNoticeView {
  incidentId: string;
  sessionLogId: string;
  loggedDate: string;
  sessionLabel: string | null;
  resolution: IncidentResolution;
  closedOutAt: string;
}

export async function readNotDoneNotices(admin: SupabaseClient<Database>, userId: string): Promise<NotDoneNoticeView[]> {
  const windowStart = new Date(Date.now() - NOT_DONE_NOTICE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: incidents, error: incidentsError } = await admin
    .from("schedule_incidents")
    .select("id, resolution, closed_out_at, resulting_session_log_id")
    .eq("user_id", userId)
    .eq("closeout_outcome", "log_created")
    .is("acknowledged_at", null)
    .gte("closed_out_at", windowStart)
    .order("closed_out_at", { ascending: false });
  if (incidentsError) throw new Error(`readNotDoneNotices: schedule_incidents — ${incidentsError.message}`);
  if (!incidents || incidents.length === 0) return [];

  const logIds = incidents.map((i) => i.resulting_session_log_id).filter((id): id is string => id !== null);
  const { data: logs, error: logsError } = await admin
    .from("session_logs")
    .select("id, logged_date, completion, excluded_at, planned_session_id")
    .in("id", logIds);
  if (logsError) throw new Error(`readNotDoneNotices: session_logs — ${logsError.message}`);

  // La correction (`completion` <> 'not_done') ou une fusion Strava (`excluded_at` renseigné, ADR-015
  // §2) retire la carte SANS écriture supplémentaire — c'est la jointure elle-même qui filtre.
  const eligibleLogs = new Map((logs ?? []).filter((l) => l.completion === "not_done" && l.excluded_at === null).map((l) => [l.id, l]));

  const plannedSessionIds = Array.from(eligibleLogs.values())
    .map((l) => l.planned_session_id)
    .filter((id): id is string => id !== null);
  const { data: plannedSessions } = plannedSessionIds.length
    ? await admin.from("planned_sessions").select("id, session_type, duration_min").in("id", plannedSessionIds)
    : { data: [] as { id: string; session_type: string; duration_min: number | null }[] };
  const labelBySessionId = new Map((plannedSessions ?? []).map((p) => [p.id, `${p.session_type}${p.duration_min ? ` — ${p.duration_min} min` : ""}`]));

  const notices: NotDoneNoticeView[] = [];
  for (const incident of incidents) {
    if (!incident.resulting_session_log_id) continue;
    const log = eligibleLogs.get(incident.resulting_session_log_id);
    if (!log) continue;
    notices.push({
      incidentId: incident.id,
      sessionLogId: log.id,
      loggedDate: log.logged_date,
      sessionLabel: log.planned_session_id ? (labelBySessionId.get(log.planned_session_id) ?? null) : null,
      resolution: incident.resolution,
      closedOutAt: incident.closed_out_at!,
    });
  }
  return notices;
}
