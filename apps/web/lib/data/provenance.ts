/**
 * `resolveProvenance()` — ADR-015 §3. `session_logs.source` reste IMMUABLE (jamais réécrit
 * `'declared'` à la déconnexion, ce qui falsifierait le journal d'acquisition) ; c'est la
 * PROVENANCE AFFICHÉE, dérivée à la lecture, qui bascule :
 *
 *   provenance affichée = 'synced'   si source = 'connected' ET connexion associée active
 *                       = 'declared' sinon
 *
 * Fonction pure, sans I/O — peut être appelée aussi bien côté serveur (construction de
 * `DataOverviewView`/`ActivityFeedItem`) que dans un composant qui reçoit déjà `status` résolu.
 */

import type { Database } from "@hybride/db";

type DataSource = Database["public"]["Enums"]["data_source"];
type DataConnectionStatus = Database["public"]["Enums"]["data_connection_status"];

export type DisplayedProvenance = "synced" | "declared";

export function resolveProvenance(source: DataSource, connectionStatus: DataConnectionStatus | null): DisplayedProvenance {
  return source === "connected" && connectionStatus === "active" ? "synced" : "declared";
}
