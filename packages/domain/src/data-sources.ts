/**
 * Contrats des routes `/data/*` — US-02, `08-architecture.md` §13.3. Connexion de sources
 * (AC1, AC2, AC10) et tableau de bord centralisé (AC6).
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date ISO attendue (YYYY-MM-DD).");

// ---------------------------------------------------------------------------
// GET /data/providers — AC1
// ---------------------------------------------------------------------------

/** Quatre états — design §3.3 : `NON CONNECTÉ`, `CONNECTÉ`, `SAISIE MANUELLE`, `RECONNEXION REQUISE`. */
export type DataSourceStatus = "not_connected" | "connected" | "manual" | "needs_reauth";

export interface DataSourceView {
  code: string;
  label: string;
  kind: "oauth" | "manual";
  description: string;
  status: DataSourceStatus;
  connectionId: string | null; // pour `DELETE /data/connections/:id`
  lastSyncedAt: string | null; // ISO datetime
  lastErrorCode: string | null;
}

export interface DataSourcesView {
  sources: DataSourceView[];
}

// ---------------------------------------------------------------------------
// POST /data/connections/:provider/authorize — AC2
// ---------------------------------------------------------------------------

export interface AuthorizeConnectionResponse {
  authorizeUrl: string;
  state: string;
}

// ---------------------------------------------------------------------------
// DELETE /data/connections/:id — AC10
// ---------------------------------------------------------------------------

export interface DisconnectDataConnectionResponse {
  status: "revoked";
  /** Nombre de séances CONSERVÉES (AC10 — jamais supprimées), pour le message de confirmation. */
  retainedLogs: number;
}

// ---------------------------------------------------------------------------
// GET /data/activities?from&to — AC6 (« Détail → »)
// ---------------------------------------------------------------------------

export const ActivitiesQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type ActivitiesQuery = z.infer<typeof ActivitiesQuerySchema>;

export interface ActivityFeedItem {
  id: string;
  loggedDate: string; // ISO date
  sportCode: string | null;
  sessionType: string | null;
  durationMin: number | null;
  loadUnits: number | null;
  distanceM: number | null;
  provenance: "synced" | "declared";
  /** `true` si cette ligne est le résultat d'une fusion (AC5) — porte l'enrichissement d'une saisie. */
  merged: boolean;
}

// ---------------------------------------------------------------------------
// GET /data/overview — AC6
// ---------------------------------------------------------------------------

export interface DataOverviewCell {
  key: "load" | "recovery" | "sleep" | "resting_hr";
  value: string | null; // null ⇒ « — » (régime froid)
  label: string;
  trend: string | null;
  tone: "info" | "success" | "neutral";
  provenance: "synced" | "declared" | "mixed" | null; // glyphes ↻ / ✎ / ↻✎, design §2.2
}

export interface DataOverviewSync {
  status: "idle" | "running" | "failed";
  lastSyncedAt: string | null;
  errorMessage: string | null;
}

export interface DataOverviewView {
  regime: "cold" | "declared" | "connected";
  sourcesSummary: string | null; // « 3 sources · Strava, muscu, nutrition »
  cells: DataOverviewCell[];
  sync: DataOverviewSync | null; // état « SYNCHRONISATION EN ÉCHEC », design §2.6
  hybridScore: { status: "calibration" | "available"; score: number | null };
}
