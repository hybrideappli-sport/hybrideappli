import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

/**
 * Rétention par défaut (jours) — voir `supabase/migrations/0013_billing_robustness.sql` pour le
 * rationnel complet (finding I3). La RÈGLE vit en base (`purge_stale_stripe_events()`) : ce module
 * ne fait qu'invoquer la fonction depuis le cron quotidien, sans dupliquer le seuil.
 */
export async function purgeStaleStripeEvents(admin: SupabaseClient<Database>): Promise<{ purged: number }> {
  const { data, error } = await admin.rpc("purge_stale_stripe_events");
  if (error) throw new Error(`purgeStaleStripeEvents: ${error.message}`);
  return { purged: data ?? 0 };
}
