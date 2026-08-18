import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { DataOverviewCell, DataOverviewView } from "@hybride/domain";

import { resolveProvenance } from "./provenance";

const RECENT_LOAD_WINDOW_DAYS = 7;

type DataConnectionStatus = Database["public"]["Enums"]["data_connection_status"];

/**
 * `fetchDataOverview()` — AC6. Extrait de `GET /api/v1/data/overview` (`08-architecture.md` §13.3),
 * réutilisé TEL QUEL par la carte « Mes données » du Dashboard (`components/dashboard/data-card.tsx`)
 * pour ne jamais dupliquer cette logique entre la route et le Server Component qui l'affiche.
 */
export async function fetchDataOverview(admin: SupabaseClient<Database>, args: { userId: string; now: string }): Promise<DataOverviewView> {
  const { userId, now } = args;

  const windowStart = new Date(`${now}T00:00:00.000Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - (RECENT_LOAD_WINDOW_DAYS - 1));
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const [athleteProfileRes, providersRes, connectionsRes, recentLogsRes, latestBodyMetricRes, latestSessionLogRes, hybridScoreRes] = await Promise.all([
    admin.from("athlete_profiles").select("data_regime").eq("user_id", userId).maybeSingle(),
    admin.from("data_providers").select("code, label_fr, kind").order("display_order", { ascending: true }),
    admin.from("data_connections").select("id, provider_code, status, last_synced_at, last_sync_status, last_error_code").eq("user_id", userId),
    admin
      .from("session_logs_counted")
      .select("load_units, source, data_connections(status)")
      .eq("user_id", userId)
      .gte("logged_date", windowStartIso)
      .lte("logged_date", now),
    admin.from("body_metrics").select("resting_hr, sleep_hours, measured_on").eq("user_id", userId).order("measured_on", { ascending: false }).limit(1).maybeSingle(),
    admin
      .from("session_logs_counted")
      .select("freshness, logged_date")
      .eq("user_id", userId)
      .not("freshness", "is", null)
      .order("logged_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("hybrid_scores").select("status, score").eq("user_id", userId).order("computed_for", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (athleteProfileRes.error) throw new Error(`fetchDataOverview: athlete_profiles — ${athleteProfileRes.error.message}`);
  if (providersRes.error) throw new Error(`fetchDataOverview: data_providers — ${providersRes.error.message}`);
  if (connectionsRes.error) throw new Error(`fetchDataOverview: data_connections — ${connectionsRes.error.message}`);
  if (recentLogsRes.error) throw new Error(`fetchDataOverview: session_logs_counted (charge) — ${recentLogsRes.error.message}`);

  const regime = athleteProfileRes.data?.data_regime ?? "cold";

  // Résumé de sources — connexions ACTIVES + sources manuelles (toujours disponibles dès qu'une
  // saisie déclarative existe). Simplification assumée (§12 question 13 relayée à `designer` : le
  // libellé exact et l'ordre restent à valider sur les notes de design complètes).
  const activeProviderCodes = new Set((connectionsRes.data ?? []).filter((c) => c.status === "active").map((c) => c.provider_code));
  const manualProviderLabels = (providersRes.data ?? []).filter((p) => p.kind === "manual").map((p) => p.label_fr);
  const activeOauthLabels = (providersRes.data ?? []).filter((p) => p.kind === "oauth" && activeProviderCodes.has(p.code)).map((p) => p.label_fr);
  const sourceLabels = [...activeOauthLabels, ...manualProviderLabels];
  const sourcesSummary = regime === "cold" ? null : `${sourceLabels.length} source${sourceLabels.length > 1 ? "s" : ""} · ${sourceLabels.join(", ")}`;

  let totalLoad = 0;
  let hasSynced = false;
  let hasDeclared = false;
  for (const row of recentLogsRes.data ?? []) {
    totalLoad += row.load_units ?? 0;
    const connectionStatus = (row.data_connections as unknown as { status: DataConnectionStatus } | null)?.status ?? null;
    const provenance = resolveProvenance(row.source ?? "declared", connectionStatus);
    if (provenance === "synced") hasSynced = true;
    else hasDeclared = true;
  }
  const loadProvenance: DataOverviewCell["provenance"] =
    regime === "cold" || (!hasSynced && !hasDeclared) ? null : hasSynced && hasDeclared ? "mixed" : hasSynced ? "synced" : "declared";

  const cells: DataOverviewCell[] = [
    { key: "load", value: regime === "cold" ? null : String(totalLoad), label: "Charge (7 j)", trend: null, tone: "info", provenance: loadProvenance },
    {
      key: "recovery",
      value: latestSessionLogRes.data?.freshness != null ? String(latestSessionLogRes.data.freshness) : null,
      label: "Fraîcheur",
      trend: null,
      tone: "neutral",
      provenance: latestSessionLogRes.data?.freshness != null ? "declared" : null,
    },
    {
      key: "sleep",
      value: latestBodyMetricRes.data?.sleep_hours != null ? String(latestBodyMetricRes.data.sleep_hours) : null,
      label: "Sommeil",
      trend: null,
      tone: "neutral",
      // Strava n'expose pas le sommeil (ADR-013) : toujours déclaré en V1.
      provenance: latestBodyMetricRes.data?.sleep_hours != null ? "declared" : null,
    },
    {
      key: "resting_hr",
      value: latestBodyMetricRes.data?.resting_hr != null ? String(latestBodyMetricRes.data.resting_hr) : null,
      label: "FC repos",
      trend: null,
      tone: "neutral",
      provenance: latestBodyMetricRes.data?.resting_hr != null ? "declared" : null,
    },
  ];

  const oauthConnections = (connectionsRes.data ?? []).filter((c) => c.status === "active" || c.status === "needs_reauth");
  const sync: DataOverviewView["sync"] =
    oauthConnections.length === 0
      ? null
      : {
          status: oauthConnections.some((c) => c.status === "needs_reauth" || c.last_sync_status === "failed") ? "failed" : "idle",
          lastSyncedAt:
            oauthConnections
              .map((c) => c.last_synced_at)
              .filter((v): v is string => v !== null)
              .sort()
              .at(-1) ?? null,
          errorMessage: oauthConnections.find((c) => c.last_error_code)?.last_error_code ?? null,
        };

  return {
    regime,
    sourcesSummary,
    cells,
    sync,
    hybridScore: { status: hybridScoreRes.data?.status ?? "calibration", score: hybridScoreRes.data?.score ?? null },
  };
}
