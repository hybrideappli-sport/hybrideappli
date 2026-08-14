import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { recalculateHybridScoreQuietly } from "@/lib/score/compute-and-store-hybrid-score";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/session-logs/:id/unmerge` — AC5, ADR-015 §2 (« la fusion est réversible »).
 * Rétablit UNIQUEMENT la ligne perdante (`excluded_at = null`) : n'annule PAS l'enrichissement déjà
 * appliqué à la ligne portante (RPE/fraîcheur/douleur transférés restent en place — les revenir en
 * arrière romprait potentiellement un signal de sécurité déjà pris en compte ailleurs). Recalcule le
 * score hybride, silencieusement (AC9).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: logId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  const { data: log, error: logError } = await admin
    .from("session_logs")
    .select("id, user_id, excluded_at, exclusion_reason")
    .eq("id", logId)
    .maybeSingle();
  if (logError) return apiError(500, "INTERNAL_ERROR", logError.message);
  if (!log || log.user_id !== user.id) return apiError(404, "NOT_FOUND", "Séance introuvable.");

  if (log.excluded_at === null || log.exclusion_reason !== "merged_duplicate") {
    return apiError(409, "CONFLICT", "Cette séance n'est pas le résultat d'une fusion — rien à annuler.");
  }

  const { error: updateError } = await admin
    .from("session_logs")
    .update({ excluded_at: null, exclusion_reason: null, superseded_by_log_id: null })
    .eq("id", logId);
  if (updateError) return apiError(500, "INTERNAL_ERROR", updateError.message);

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");
  await recalculateHybridScoreQuietly(admin, { userId: user.id, now });

  return apiJson({ logId, restored: true });
}
