import "server-only";

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@hybride/db";

/**
 * Client Supabase pour Server Components et Route Handlers. Voir
 * `packages/db/src/client/server.ts` : `@hybride/db` ne dépend jamais de
 * `next` directement (ADR-003), c'est cette fonction, côté `apps/web`, qui
 * fournit l'adaptateur cookies branché sur `next/headers`.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Appelé depuis un Server Component (lecture seule) : la mutation de
        // cookies est ignorée ici, `proxy.ts` rafraîchit la session sur la
        // requête suivante (comportement documenté de @supabase/ssr).
      }
    },
  });
}
