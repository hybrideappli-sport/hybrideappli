import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { SessionType } from "@hybride/domain";

/**
 * Lecture dédiée à `/aujourdhui?log=<id>` (F3, `11-design-notes.md` §3.3 — parcours de correction).
 * Contrairement à `fetchTodaySessionView()`, la séance visée n'est pas forcément « d'aujourd'hui » —
 * un `not_done` automatique (ADR-017) est corrigé plusieurs jours après sa clôture.
 */
export interface SessionLogForCorrectionView {
  id: string;
  loggedDate: string; // ISO date de LA SÉANCE concernée, pas celle du jour de la correction.
  sessionType: SessionType | null;
  durationMin: number | null;
  sportCode: string | null;
}

export async function fetchSessionLogForCorrection(
  admin: SupabaseClient<Database>,
  args: { userId: string; logId: string },
): Promise<SessionLogForCorrectionView | null> {
  const { userId, logId } = args;

  const { data: log, error: logError } = await admin
    .from("session_logs")
    .select("id, user_id, logged_date, planned_session_id, sport_id, session_type, actual_duration_min, sports(code)")
    .eq("id", logId)
    .maybeSingle();
  if (logError) throw new Error(`fetchSessionLogForCorrection: session_logs — ${logError.message}`);
  if (!log || log.user_id !== userId) return null;

  let sessionType: SessionType | null = log.session_type;
  let durationMin: number | null = log.actual_duration_min;
  let sportCode: string | null = (log.sports as unknown as { code: string } | null)?.code ?? null;

  // La séance était RATTACHÉE à un plan (cas le plus fréquent d'un `not_done` de clôture, ADR-017
  // §4) : titre/méta viennent de la prescription d'origine, pas de la ligne de réalisé (qui ne les
  // porte que pour une séance hors plan, AC3).
  if (log.planned_session_id) {
    const { data: planned, error: plannedError } = await admin
      .from("planned_sessions")
      .select("session_type, duration_min, sports(code)")
      .eq("id", log.planned_session_id)
      .maybeSingle();
    if (plannedError) throw new Error(`fetchSessionLogForCorrection: planned_sessions — ${plannedError.message}`);
    if (planned) {
      sessionType = planned.session_type;
      durationMin = planned.duration_min;
      sportCode = (planned.sports as unknown as { code: string } | null)?.code ?? sportCode;
    }
  }

  return { id: log.id, loggedDate: log.logged_date, sessionType, durationMin, sportCode };
}
