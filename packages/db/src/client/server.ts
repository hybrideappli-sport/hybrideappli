import { createServerClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "../env";
import type { Database } from "../types";

export type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/**
 * Adaptateur cookies minimal, indépendant de Next.js — `@hybride/db` ne
 * dépend jamais de `next` (frontière ADR-003 : `db → domain` uniquement
 * comme dépendance interne). L'appelant (`apps/web`) fournit l'implémentation
 * branchée sur `next/headers`.
 */
export type ServerCookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookiesToSet: CookieToSet[]) => void;
};

/**
 * Client Supabase pour le contexte serveur (Server Components, Route
 * Handlers, proxy de session). S'appuie sur la clé publique (anon) : RLS
 * s'applique via `auth.uid()` déduit de la session cookie.
 */
export function createSupabaseServerClient(cookies: ServerCookieAdapter) {
  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: cookies.getAll,
      setAll: cookies.setAll,
    },
  });
}
