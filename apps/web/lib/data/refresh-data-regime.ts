import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

/**
 * `refreshDataRegime()` — `08-architecture.md` §13.5. Recalculé CÔTÉ SERVEUR uniquement, jamais par
 * le client (même doctrine que `data_regime` déjà posée par la F1, `0003_athlete_profile.sql` :
 * « piloté serveur, pas client »). Appelée après une connexion, une déconnexion, un retrait du
 * consentement `third_party_data_import`, et le premier log réalisé (`apply-daily-log.ts`).
 *
 * ```
 * 'connected'  s'il existe au moins une data_connections en statut 'active'
 * 'declared'   sinon, s'il existe au moins une donnée réalisée (session_logs / body_metrics / nutrition_checkins)
 * 'cold'       sinon
 * ```
 */
export type DataRegime = "cold" | "declared" | "connected";

export class RefreshDataRegimeError extends Error {}

export async function refreshDataRegime(admin: SupabaseClient<Database>, userId: string): Promise<DataRegime> {
  const [activeConnections, sessionLogs, bodyMetrics, nutritionCheckins] = await Promise.all([
    admin.from("data_connections").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    admin.from("session_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("body_metrics").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("nutrition_checkins").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  if (activeConnections.error) throw new RefreshDataRegimeError(`refreshDataRegime: data_connections — ${activeConnections.error.message}`);
  if (sessionLogs.error) throw new RefreshDataRegimeError(`refreshDataRegime: session_logs — ${sessionLogs.error.message}`);
  if (bodyMetrics.error) throw new RefreshDataRegimeError(`refreshDataRegime: body_metrics — ${bodyMetrics.error.message}`);
  if (nutritionCheckins.error) throw new RefreshDataRegimeError(`refreshDataRegime: nutrition_checkins — ${nutritionCheckins.error.message}`);

  const regime: DataRegime =
    (activeConnections.count ?? 0) > 0
      ? "connected"
      : (sessionLogs.count ?? 0) + (bodyMetrics.count ?? 0) + (nutritionCheckins.count ?? 0) > 0
        ? "declared"
        : "cold";

  const { error: updateError } = await admin.from("athlete_profiles").update({ data_regime: regime }).eq("user_id", userId);
  if (updateError) throw new RefreshDataRegimeError(`refreshDataRegime: écriture athlete_profiles — ${updateError.message}`);

  return regime;
}
