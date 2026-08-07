/**
 * @hybride/db
 *
 * Client Supabase typé (browser / server / service_role) + types générés
 * depuis le schéma (`Database`, voir `./types`). Les repositories métier
 * (requêtes par table, orchestration de persistance) seront ajoutés au fil
 * des lots suivants, au plus près de leurs orchestrateurs
 * (`08-architecture.md` §3.2).
 */

export { createSupabaseBrowserClient } from "./client/browser";
export {
  createSupabaseServerClient,
  type ServerCookieAdapter,
  type CookieToSet,
} from "./client/server";
export { createSupabaseServiceRoleClient } from "./client/service-role";
export type { Database } from "./types";
