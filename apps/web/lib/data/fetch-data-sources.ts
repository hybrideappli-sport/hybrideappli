import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { DataSourceStatus, DataSourcesView, DataSourceView } from "@hybride/domain";

/**
 * `fetchDataSources()` — AC1. Extrait de `GET /api/v1/data/providers`, réutilisé TEL QUEL par
 * l'écran `/donnees` (`app/(app)/donnees/page.tsx`) pour ne jamais dupliquer cette logique.
 */
export async function fetchDataSources(admin: SupabaseClient<Database>, userId: string): Promise<DataSourcesView> {
  const [providersRes, connectionsRes] = await Promise.all([
    admin.from("data_providers").select("code, label_fr, kind, description_fr, is_available").order("display_order", { ascending: true }),
    admin
      .from("data_connections")
      .select("id, provider_code, status, last_synced_at, last_error_code")
      .eq("user_id", userId)
      .in("status", ["pending", "active", "needs_reauth"]),
  ]);
  if (providersRes.error) throw new Error(`fetchDataSources: data_providers — ${providersRes.error.message}`);
  if (connectionsRes.error) throw new Error(`fetchDataSources: data_connections — ${connectionsRes.error.message}`);

  const connectionByProvider = new Map((connectionsRes.data ?? []).map((c) => [c.provider_code, c]));

  const sources: DataSourceView[] = (providersRes.data ?? [])
    .filter((provider) => provider.is_available)
    .map((provider) => {
      if (provider.kind === "manual") {
        return {
          code: provider.code,
          label: provider.label_fr,
          kind: "manual",
          description: provider.description_fr,
          status: "manual" satisfies DataSourceStatus,
          connectionId: null,
          lastSyncedAt: null,
          lastErrorCode: null,
        };
      }

      const connection = connectionByProvider.get(provider.code);
      const status: DataSourceStatus = !connection
        ? "not_connected"
        : connection.status === "active"
          ? "connected"
          : connection.status === "needs_reauth"
            ? "needs_reauth"
            : "not_connected";

      return {
        code: provider.code,
        label: provider.label_fr,
        kind: "oauth",
        description: provider.description_fr,
        status,
        connectionId: connection?.id ?? null,
        lastSyncedAt: connection?.last_synced_at ?? null,
        lastErrorCode: connection?.last_error_code ?? null,
      };
    });

  return { sources };
}
