import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "../env";
import type { Database } from "../types";

/**
 * Client `service_role` — contourne RLS. Réservé aux traitements serveur de
 * confiance (jobs, webhooks, orchestrateurs) : seul chemin d'écriture pour
 * les tables produites par le moteur (`08-architecture.md` §5, §8).
 *
 * NE JAMAIS importer ce module depuis un Client Component ni l'exposer au
 * bundle navigateur : `SUPABASE_SERVICE_ROLE_KEY` n'est jamais préfixée
 * `NEXT_PUBLIC_`.
 */
export function createSupabaseServiceRoleClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
