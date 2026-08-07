import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "../env";
import type { Database } from "../types";

/**
 * Client Supabase pour les Client Components. S'appuie sur la clé publique
 * (anon/publishable) — RLS reste la ligne de défense (voir `08-architecture.md` §8).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseAnonKey());
}
