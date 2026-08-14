import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";

import { fetchActivitiesPage, fetchActivity, StravaRateLimitedError, type StravaRateLimit } from "../providers/strava/client";
import { getValidAccessToken } from "../providers/strava/tokens";
import { importStravaActivity } from "../providers/strava/import-activity";
import { recalculateHybridScoreQuietly } from "../score/compute-and-store-hybrid-score";
import { refreshDataRegime } from "../data/refresh-data-regime";
import { todayInTimezone } from "../orchestration/today-in-timezone";

const BACKFILL_WINDOW_DAYS = 90; // dépasse les 4 semaines de calibration du score hybride (ADR-013 §1)
const RECONCILE_WINDOW_DAYS = 7; // filet quotidien (ADR-013 §1)
const PAGE_SIZE = 30;
// Borne dure — jamais une boucle synchrone non bornée (ADR-013 §1). 10 pages × 30 = 300 activités
// max par exécution ; un historique plus riche est rattrapé sur les exécutions suivantes du job
// (replanifié par le back-off standard de `markJobFailed()` en cas d'épuisement, ou simplement lors
// du prochain `strava_reconcile` quotidien).
const MAX_PAGES_PER_RUN = 10;

interface SyncOutcome {
  itemsSeen: number;
  itemsImported: number;
  itemsMerged: number;
  itemsSkipped: number;
  itemsFailed: number;
}

const EMPTY_OUTCOME: SyncOutcome = { itemsSeen: 0, itemsImported: 0, itemsMerged: 0, itemsSkipped: 0, itemsFailed: 0 };

async function startSyncRun(
  admin: SupabaseClient<Database>,
  args: { userId: string; connectionId: string; trigger: Database["public"]["Enums"]["sync_trigger"]; windowStart: string | null; windowEnd: string | null },
): Promise<string> {
  const { data, error } = await admin
    .from("sync_runs")
    .insert({ user_id: args.userId, data_connection_id: args.connectionId, trigger: args.trigger, window_start: args.windowStart, window_end: args.windowEnd, status: "running" })
    .select("id")
    .single();
  if (error) throw new Error(`startSyncRun: sync_runs — ${error.message}`);
  return data.id;
}

async function finishSyncRun(
  admin: SupabaseClient<Database>,
  runId: string,
  outcome: SyncOutcome & { status: "succeeded" | "partial" | "failed"; errorCode?: string; errorMessage?: string; rateLimit?: StravaRateLimit },
): Promise<void> {
  const { error } = await admin
    .from("sync_runs")
    .update({
      status: outcome.status,
      items_seen: outcome.itemsSeen,
      items_imported: outcome.itemsImported,
      items_merged: outcome.itemsMerged,
      items_skipped: outcome.itemsSkipped,
      items_failed: outcome.itemsFailed,
      error_code: outcome.errorCode ?? null,
      error_message: outcome.errorMessage ?? null,
      rate_limit: (outcome.rateLimit ?? null) as unknown as Json,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(`finishSyncRun: sync_runs — ${error.message}`);
}

function classifyError(error: unknown): string {
  if (error instanceof StravaRateLimitedError) return "rate_limited";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("401") || message.includes("token")) return "token_invalid";
  return "provider_error";
}

async function handleSyncError(admin: SupabaseClient<Database>, connectionId: string, runId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = classifyError(error);
  await finishSyncRun(admin, runId, { ...EMPTY_OUTCOME, status: "failed", errorCode, errorMessage: message });
  await admin
    .from("data_connections")
    .update({
      last_sync_status: "failed",
      last_error_code: errorCode,
      // Un jeton invalide/expiré n'est pas rejouable par le back-off standard du job (rejouer le
      // MÊME refresh_token invalide échoue à nouveau) : bascule visible en `needs_reauth`, badge
      // orange « RECONNEXION REQUISE » (design §3.3), jamais un échec silencieux.
      ...(errorCode === "token_invalid" ? { status: "needs_reauth" as const } : {}),
    })
    .eq("id", connectionId);
}

async function importWindow(
  admin: SupabaseClient<Database>,
  args: { userId: string; connectionId: string; accessToken: string; afterEpochSeconds: number },
): Promise<SyncOutcome & { rateLimit?: StravaRateLimit }> {
  const outcome: SyncOutcome = { ...EMPTY_OUTCOME };
  let rateLimit: StravaRateLimit | undefined;

  for (let page = 1; page <= MAX_PAGES_PER_RUN; page++) {
    const result = await fetchActivitiesPage(args.accessToken, { after: args.afterEpochSeconds, page, perPage: PAGE_SIZE });
    rateLimit = result.rateLimit;
    if (result.data.length === 0) break;

    for (const activity of result.data) {
      outcome.itemsSeen += 1;
      try {
        const imported = await importStravaActivity(admin, { userId: args.userId, connectionId: args.connectionId, activity });
        if (imported.created) outcome.itemsImported += 1;
        else outcome.itemsSkipped += 1; // déjà importée (idempotence, T26)
        if (imported.merged) outcome.itemsMerged += 1;
      } catch (error) {
        outcome.itemsFailed += 1;
        console.error(`[strava-sync] import de l'activité ${activity.id} échoué : ${error instanceof Error ? error.message : error}`);
      }
    }

    if (result.data.length < PAGE_SIZE) break; // dernière page
  }

  return { ...outcome, rateLimit };
}

async function afterSuccessfulSync(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  await refreshDataRegime(admin, userId);
  const { data: profileRow } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  await recalculateHybridScoreQuietly(admin, { userId, now: todayInTimezone(profileRow?.timezone ?? "Europe/Paris") });
}

/** `strava_backfill` — rattrapage initial des 90 derniers jours, à la première connexion. */
export async function runStravaBackfill(admin: SupabaseClient<Database>, args: { connectionId: string }): Promise<void> {
  const { data: connection, error } = await admin.from("data_connections").select("id, user_id, status").eq("id", args.connectionId).single();
  if (error) throw new Error(`runStravaBackfill: lecture data_connections — ${error.message}`);
  if (connection.status !== "active") return; // révoquée entre l'enrôlement et l'exécution — no-op

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const runId = await startSyncRun(admin, {
    userId: connection.user_id,
    connectionId: connection.id,
    trigger: "initial_backfill",
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  try {
    const accessToken = await getValidAccessToken(admin, connection.id);
    const outcome = await importWindow(admin, {
      userId: connection.user_id,
      connectionId: connection.id,
      accessToken,
      afterEpochSeconds: Math.floor(windowStart.getTime() / 1000),
    });
    await finishSyncRun(admin, runId, { ...outcome, status: outcome.itemsFailed > 0 ? "partial" : "succeeded" });
    await admin
      .from("data_connections")
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: "succeeded", last_error_code: null, backfill_completed_at: new Date().toISOString() })
      .eq("id", connection.id);
    await afterSuccessfulSync(admin, connection.user_id);
  } catch (error) {
    await handleSyncError(admin, connection.id, runId, error);
    throw error; // laisse `drain.ts` appliquer le back-off/abandon standard (ADR-011 §3)
  }
}

/** `strava_activity_sync` — un événement webhook (`create`/`update`/`delete`), l'activité est
 * TOUJOURS re-récupérée avec notre propre jeton, jamais crue depuis le payload (ADR-013 §1). */
export async function runStravaActivitySync(
  admin: SupabaseClient<Database>,
  args: { connectionId: string; activityId: string; aspectType: "create" | "update" | "delete" },
): Promise<void> {
  const { data: connection, error } = await admin.from("data_connections").select("id, user_id, status").eq("id", args.connectionId).single();
  if (error) throw new Error(`runStravaActivitySync: lecture data_connections — ${error.message}`);
  if (connection.status !== "active") return;

  const runId = await startSyncRun(admin, { userId: connection.user_id, connectionId: connection.id, trigger: "webhook", windowStart: null, windowEnd: null });

  try {
    if (args.aspectType === "delete") {
      // ADR-015 §3 — exclusion, JAMAIS suppression physique (ADR-004 §1) : l'utilisateur a supprimé
      // l'activité côté Strava, mais le réalisé ne se supprime pas chez nous non plus.
      const { error: excludeError } = await admin
        .from("session_logs")
        .update({ excluded_at: new Date().toISOString(), exclusion_reason: "deleted_at_source" })
        .eq("data_connection_id", connection.id)
        .eq("external_activity_id", args.activityId)
        .is("excluded_at", null);
      if (excludeError) throw new Error(`runStravaActivitySync: exclusion — ${excludeError.message}`);
      await finishSyncRun(admin, runId, { ...EMPTY_OUTCOME, itemsSeen: 1, status: "succeeded" });
    } else {
      const accessToken = await getValidAccessToken(admin, connection.id);
      const { data: activity, rateLimit } = await fetchActivity(accessToken, args.activityId);
      const imported = await importStravaActivity(admin, { userId: connection.user_id, connectionId: connection.id, activity });
      await finishSyncRun(admin, runId, {
        itemsSeen: 1,
        itemsImported: imported.created ? 1 : 0,
        itemsSkipped: imported.created ? 0 : 1,
        itemsMerged: imported.merged ? 1 : 0,
        itemsFailed: 0,
        status: "succeeded",
        rateLimit,
      });
    }
    await admin.from("data_connections").update({ last_synced_at: new Date().toISOString(), last_sync_status: "succeeded", last_error_code: null }).eq("id", connection.id);
    await afterSuccessfulSync(admin, connection.user_id);
  } catch (error) {
    await handleSyncError(admin, connection.id, runId, error);
    throw error;
  }
}

/** `strava_reconcile` — filet quotidien, fenêtre glissante de 7 jours (ADR-013 §1). */
export async function runStravaReconcile(admin: SupabaseClient<Database>, args: { connectionId: string }): Promise<void> {
  const { data: connection, error } = await admin.from("data_connections").select("id, user_id, status").eq("id", args.connectionId).single();
  if (error) throw new Error(`runStravaReconcile: lecture data_connections — ${error.message}`);
  if (connection.status !== "active") return;

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const runId = await startSyncRun(admin, {
    userId: connection.user_id,
    connectionId: connection.id,
    trigger: "scheduled_reconcile",
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  try {
    const accessToken = await getValidAccessToken(admin, connection.id);
    const outcome = await importWindow(admin, {
      userId: connection.user_id,
      connectionId: connection.id,
      accessToken,
      afterEpochSeconds: Math.floor(windowStart.getTime() / 1000),
    });
    await finishSyncRun(admin, runId, { ...outcome, status: outcome.itemsFailed > 0 ? "partial" : "succeeded" });
    await admin.from("data_connections").update({ last_synced_at: new Date().toISOString(), last_sync_status: "succeeded", last_error_code: null }).eq("id", connection.id);
    await afterSuccessfulSync(admin, connection.user_id);
  } catch (error) {
    await handleSyncError(admin, connection.id, runId, error);
    throw error;
  }
}
