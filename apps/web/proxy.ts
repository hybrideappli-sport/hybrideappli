import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@hybride/db";

// Next.js 16 : le fichier `middleware.ts` est renommé `proxy.ts`, la fonction
// exportée `proxy` (anciennement `middleware`). Runtime nodejs uniquement,
// non configurable — voir node_modules/next/dist/docs (upgrade guide v16).
//
// Rôle unique ici : rafraîchir la session Supabase à chaque requête et
// protéger les routes authentifiées. Aucune logique métier (ADR-001) — le
// paywall (`requireEntitlement()`) est une couche serveur distincte, plus
// bas dans la pile (08-architecture.md §3.3), pas ce fichier.

const AUTH_PATHS = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/auth"];
const PROTECTED_PREFIXES = ["/dashboard", "/aujourdhui", "/onboarding", "/abonnement", "/facturation", "/revision"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  });

  // Ne JAMAIS retirer cet appel : c'est lui qui rafraîchit le token de
  // session et réécrit le cookie via `setAll` ci-dessus (doc @supabase/ssr).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthPath = AUTH_PATHS.some((path) => pathname.startsWith(path));
  const isProtectedPath = PROTECTED_PREFIXES.some((path) => pathname.startsWith(path));

  if (!user && isProtectedPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/connexion";
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPath && !pathname.startsWith("/auth")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.searchParams.delete("redirectTo");
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf les assets statiques et les fichiers d'image.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
