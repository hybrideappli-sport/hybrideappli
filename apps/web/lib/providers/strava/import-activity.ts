import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { finalizeSessionLogLoad } from "../../data/finalize-session-log-load";
import { reconcileSessionLogs } from "../../data/reconcile-session-logs";
import type { StravaActivity } from "./client";

export interface ImportStravaActivityResult {
  logId: string;
  created: boolean;
  merged: boolean;
}

/**
 * Mapping MINIMISÉ (ADR-013 §4) : identifiant d'activité, type de sport, date/heure de début, durée
 * écoulée/en mouvement, distance, dénivelé positif. RIEN d'autre — un payload Strava contenant
 * `average_heartrate`, une `polyline` ou un `name` n'est jamais lu au-delà des champs listés ici
 * (`strava-activity-mapping.test.ts`, plan §4.2).
 *
 * Idempotence (T26, `session_logs_external_activity`, `0019_actuals_data_sources.sql`) : un même
 * `external_activity_id` importé plusieurs fois (webhook rejoué, réconciliation qui repasse sur la
 * même fenêtre) ne crée jamais une seconde ligne — vérifié ICI par lecture avant écriture, ET
 * garanti en dernier ressort par l'index unique en base.
 */
export async function importStravaActivity(
  admin: SupabaseClient<Database>,
  args: { userId: string; connectionId: string; activity: StravaActivity },
): Promise<ImportStravaActivityResult> {
  const { userId, connectionId, activity } = args;
  const externalActivityId = String(activity.id);

  const { data: existing, error: existingError } = await admin
    .from("session_logs")
    .select("id")
    .eq("data_connection_id", connectionId)
    .eq("external_activity_id", externalActivityId)
    .maybeSingle();
  if (existingError) throw new Error(`importStravaActivity: lecture idempotence — ${existingError.message}`);
  if (existing) return { logId: existing.id, created: false, merged: false };

  const { data: mapping, error: mappingError } = await admin
    .from("external_sport_mappings")
    .select("sport_id, default_session_type")
    .eq("provider_code", "strava")
    .eq("external_code", activity.sport_type)
    .maybeSingle();
  if (mappingError) throw new Error(`importStravaActivity: lecture external_sport_mappings — ${mappingError.message}`);

  const startedAt = new Date(activity.start_date).toISOString();
  const loggedDate = startedAt.slice(0, 10);
  const movingTimeMin = Math.max(0, Math.round(activity.moving_time / 60));

  // AC3 — `sport_id` non cartographié (`mapping` absent) : importée SANS discipline plutôt que
  // rejetée. `session_type` par défaut `'endurance'` si le référentiel lui-même est incomplet
  // (ne devrait pas arriver, filet défensif).
  const { data: inserted, error: insertError } = await admin
    .from("session_logs")
    .insert({
      user_id: userId,
      planned_session_id: null,
      logged_date: loggedDate,
      started_at: startedAt,
      sport_id: mapping?.sport_id ?? null,
      session_type: mapping?.default_session_type ?? "endurance",
      completion: "done",
      actual_duration_min: movingTimeMin,
      pain: "none",
      source: "connected",
      data_connection_id: connectionId,
      external_activity_id: externalActivityId,
      distance_m: Math.round(activity.distance),
      elevation_gain_m: Math.round(activity.total_elevation_gain),
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`importStravaActivity: insertion session_logs — ${insertError.message}`);

  await finalizeSessionLogLoad(admin, { logId: inserted.id, userId });
  const reconciliation = await reconcileSessionLogs(admin, { userId, logId: inserted.id });

  return { logId: inserted.id, created: true, merged: reconciliation.merged };
}
