import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { SessionLogNotFoundError, SessionLogNotMergedError, unmergeSessionLog } from "@/lib/data/unmerge-session-log";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/session-logs/:id/unmerge` — AC5, ADR-015 §2 (« la fusion est réversible »).
 * Logique déléguée à `unmergeSessionLog()` (`lib/data/unmerge-session-log.ts`) — voir son en-tête.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: logId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  try {
    const result = await unmergeSessionLog(admin, { userId: user.id, logId, now });
    return apiJson(result);
  } catch (error) {
    if (error instanceof SessionLogNotFoundError) return apiError(404, "NOT_FOUND", "Séance introuvable.");
    if (error instanceof SessionLogNotMergedError) return apiError(409, "CONFLICT", "Cette séance n'est pas le résultat d'une fusion — rien à annuler.");
    throw error;
  }
}
