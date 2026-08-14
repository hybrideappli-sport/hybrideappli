import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { enqueueJob } from "./queue";

const CONNECTIONS_PAGE_SIZE = 1000;

/**
 * `enqueueReconcileDataSources()` — filet quotidien (ADR-013 §1) : enrôle un `strava_reconcile` par
 * connexion `active`. Idempotent par construction (`idempotency_key = 'strava_reconcile:{connection}:{date}'`)
 * : rejouer ce cron plusieurs fois le même jour n'enrôle jamais deux fois la même fenêtre.
 */
export async function enqueueReconcileDataSources(admin: SupabaseClient<Database>, now: Date = new Date()): Promise<{ scanned: number; enqueued: number }> {
  const date = now.toISOString().slice(0, 10);
  let scanned = 0;
  let enqueued = 0;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("data_connections")
      .select("id, user_id")
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(from, from + CONNECTIONS_PAGE_SIZE - 1);
    if (error) throw new Error(`enqueueReconcileDataSources: data_connections — ${error.message}`);

    for (const connection of data ?? []) {
      scanned += 1;
      const result = await enqueueJob(admin, {
        kind: "strava_reconcile",
        userId: connection.user_id,
        idempotencyKey: `strava_reconcile:${connection.id}:${date}`,
        payload: { connectionId: connection.id },
        scheduledFor: now.toISOString(),
      });
      if (result.enqueued) enqueued += 1;
    }

    if (!data || data.length < CONNECTIONS_PAGE_SIZE) break;
    from += CONNECTIONS_PAGE_SIZE;
  }

  return { scanned, enqueued };
}
