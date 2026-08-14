import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { Database } from "@hybride/db";
import { ActivitiesQuerySchema, type ActivityFeedItem } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { resolveProvenance } from "@/lib/data/provenance";

type DataConnectionStatus = Database["public"]["Enums"]["data_connection_status"];

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/data/activities?from&to` — AC6 (« Détail → »). Lecture `session_logs_counted`
 * (fusions déjà résolues : la ligne perdante n'apparaît jamais, ADR-015 §3) ; `merged: true` marque
 * la ligne PORTANTE d'une fusion (celle qui a été enrichie), pas les deux lignes d'origine.
 */
export async function GET(request: Request) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { searchParams } = new URL(request.url);
  const parsed = ActivitiesQuerySchema.safeParse({ from: searchParams.get("from"), to: searchParams.get("to") });
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Paramètres from/to invalides.", parsed.error.issues);

  const admin = createSupabaseServiceRoleClient();

  const [activitiesRes, mergedWinnersRes] = await Promise.all([
    admin
      .from("session_logs_counted")
      .select("id, logged_date, session_type, actual_duration_min, load_units, distance_m, source, data_connections(status), sports(code)")
      .eq("user_id", user.id)
      .gte("logged_date", parsed.data.from)
      .lte("logged_date", parsed.data.to)
      .order("logged_date", { ascending: false }),
    admin.from("session_logs").select("superseded_by_log_id").eq("user_id", user.id).not("superseded_by_log_id", "is", null),
  ]);
  if (activitiesRes.error) return apiError(500, "INTERNAL_ERROR", activitiesRes.error.message);
  if (mergedWinnersRes.error) return apiError(500, "INTERNAL_ERROR", mergedWinnersRes.error.message);

  const mergedWinnerIds = new Set((mergedWinnersRes.data ?? []).map((row) => row.superseded_by_log_id).filter((id): id is string => id !== null));

  // `session_logs_counted` est une VUE : `id`/`logged_date` ressortent nullable pour le générateur
  // de types alors qu'ils ne le sont jamais réellement (même artefact que `compute-and-store-
  // hybrid-score.ts`) — filtre défensif, n'exclut aucune ligne réelle.
  const items: ActivityFeedItem[] = (activitiesRes.data ?? [])
    .filter((row): row is typeof row & { id: string; logged_date: string } => row.id !== null && row.logged_date !== null)
    .map((row) => {
    const connectionStatus = (row.data_connections as unknown as { status: DataConnectionStatus } | null)?.status ?? null;
    return {
      id: row.id,
      loggedDate: row.logged_date,
      sportCode: (row.sports as unknown as { code: string } | null)?.code ?? null,
      sessionType: row.session_type,
      durationMin: row.actual_duration_min,
      loadUnits: row.load_units,
      distanceM: row.distance_m,
      provenance: resolveProvenance(row.source ?? "declared", connectionStatus),
      merged: mergedWinnerIds.has(row.id),
    };
  });

  return apiJson<ActivityFeedItem[]>(items, { headers: { "Cache-Control": "no-store" } });
}
