"use client";

import { createSupabaseBrowserClient } from "@hybride/db";

/**
 * Client Supabase pour les Client Components (formulaires d'authentification).
 * S'appuie sur la clé publique (anon) — RLS reste la ligne de défense.
 */
export function getSupabaseBrowserClient() {
  return createSupabaseBrowserClient();
}
