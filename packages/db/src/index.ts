/**
 * @hybride/db
 *
 * Client Supabase typé (browser / server) + types générés depuis le schéma
 * (`Database`, voir `./types`). Les repositories métier (requêtes par
 * table, orchestration de persistance) seront ajoutés au fil des lots
 * suivants, au plus près de leurs orchestrateurs (`08-architecture.md`
 * §3.2).
 *
 * `createSupabaseServiceRoleClient` n'est PAS réexporté ici : il vit dans
 * l'entrée dédiée `@hybride/db/server` (voir `package.json` `exports`,
 * `./client/service-role.ts`). Ce barrel racine est importé aussi bien
 * depuis du code serveur que depuis des Client Components (ex.
 * `apps/web/lib/supabase/browser.ts`, `"use client"`) : y laisser transiter
 * le client service_role le ferait entrer dans le graphe de modules
 * navigateur, protégé jusque-là seulement par un détail d'implémentation
 * (accès dynamique à `process.env`, non inlinable par Next.js) et non par
 * une vraie barrière (finding I6, audit Lot L1).
 */

export { createSupabaseBrowserClient } from "./client/browser";
export {
  createSupabaseServerClient,
  type ServerCookieAdapter,
  type CookieToSet,
} from "./client/server";
export type { Database } from "./types";
