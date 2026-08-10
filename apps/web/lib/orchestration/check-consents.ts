import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { ConsentCode } from "@hybride/domain";

/** Appelle `has_active_consent()` (`docs/db-schema.md` §0.3) via RPC — jamais réimplémenté côté application. */
export async function hasActiveConsent(client: SupabaseClient<Database>, userId: string, code: ConsentCode): Promise<boolean> {
  const { data, error } = await client.rpc("has_active_consent", { p_user: userId, p_code: code });
  if (error) throw new Error(`hasActiveConsent(${code}): ${error.message}`);
  return data === true;
}
