import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { recalculateHybridScoreQuietly } from "../score/compute-and-store-hybrid-score";

export class SessionLogNotFoundError extends Error {}
export class SessionLogNotMergedError extends Error {}

/**
 * `unmergeSessionLog()` — AC5, ADR-015 §2 (« la fusion est réversible »). Extrait de `POST
 * /session-logs/:id/unmerge` pour être testable en dehors d'un vrai contexte de requête Next (ce
 * Route Handler dépend par ailleurs de `requireUser()`/`next/headers`) — même patron que
 * `applyDailyLog()`/`applySessionLogCorrection()`.
 *
 * Rétablit UNIQUEMENT la ligne perdante (`excluded_at = null`) : n'annule PAS l'enrichissement déjà
 * appliqué à la ligne portante (RPE/fraîcheur/douleur transférés restent en place — les revenir en
 * arrière romprait potentiellement un signal de sécurité déjà pris en compte ailleurs). Recalcule le
 * score hybride, silencieusement (AC9).
 */
export async function unmergeSessionLog(admin: SupabaseClient<Database>, args: { userId: string; logId: string; now: string }): Promise<{ logId: string; restored: true }> {
  const { userId, logId, now } = args;

  const { data: log, error: logError } = await admin.from("session_logs").select("id, user_id, excluded_at, exclusion_reason").eq("id", logId).maybeSingle();
  if (logError) throw new Error(`unmergeSessionLog: session_logs (lecture) — ${logError.message}`);
  if (!log || log.user_id !== userId) throw new SessionLogNotFoundError(`unmergeSessionLog: séance ${logId} introuvable pour l'utilisateur ${userId}.`);

  if (log.excluded_at === null || log.exclusion_reason !== "merged_duplicate") {
    throw new SessionLogNotMergedError("unmergeSessionLog: cette séance n'est pas le résultat d'une fusion — rien à annuler.");
  }

  const { error: updateError } = await admin
    .from("session_logs")
    .update({ excluded_at: null, exclusion_reason: null, superseded_by_log_id: null })
    .eq("id", logId);
  if (updateError) throw new Error(`unmergeSessionLog: session_logs (mise à jour) — ${updateError.message}`);

  await recalculateHybridScoreQuietly(admin, { userId, now });

  return { logId, restored: true };
}
