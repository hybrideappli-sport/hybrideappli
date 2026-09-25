import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@hybride/db";

import { isMapTilesPlanProductionReady } from "@/lib/map/tiles-plan-guard";

// Next.js 16 : le fichier `middleware.ts` est renommé `proxy.ts`, la fonction
// exportée `proxy` (anciennement `middleware`). Runtime nodejs uniquement,
// non configurable — voir node_modules/next/dist/docs (upgrade guide v16).
//
// Rôle unique ici : rafraîchir la session Supabase à chaque requête et
// protéger les routes authentifiées. Aucune logique métier (ADR-001) — le
// paywall (`requireEntitlement()`) est une couche serveur distincte, plus
// bas dans la pile (08-architecture.md §3.3), pas ce fichier.
//
// Exception ADR-018 §8 (lot L1, étendue lot L2) : garde FAIL-CLOSED `MAP_TILES_PLAN` sur `/carte`
// ET sur `GET /api/v1/map/trails` (« la page /carte ET la route /api/v1/map/trails répondent 503
// explicite »). « Avant tout travail » veut dire ici : avant même le rafraîchissement de session
// Supabase — testé isolément dans `proxy.test.ts` en s'assurant que `createSupabaseServerClient`
// n'est JAMAIS appelé quand la garde refuse. Un SEUL point de garde pour les deux routes (au lieu
// de dupliquer la vérification dans `app/api/v1/map/trails/route.ts`) : `route.ts` suppose donc,
// comme `app/(app)/carte/page.tsx` (lot L1), avoir déjà reçu ce feu vert.
const MAP_PLAN_GATED_PATHS = ["/carte", "/api/v1/map/trails"];

function mapTilesPlanUnavailableResponse(pathname: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: {
          code: "MAP_TILES_UNAVAILABLE",
          message: "Cette fonctionnalité n'est pas encore activée en production (palier commercial requis, ADR-018 §8).",
        },
      },
      { status: 503 },
    );
  }
  return new NextResponse(
    "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\" /><title>Carte indisponible</title></head>" +
      '<body style="background:#0A0A0A;color:#fff;font-family:sans-serif;padding:24px;">' +
      "<h1>Carte indisponible</h1><p>Cette fonctionnalité n'est pas encore activée en production (palier commercial requis, ADR-018 §8).</p>" +
      "</body></html>",
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const AUTH_PATHS = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/auth"];
const PROTECTED_PREFIXES = ["/dashboard", "/aujourdhui", "/onboarding", "/abonnement", "/facturation", "/revision", "/carte"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (MAP_PLAN_GATED_PATHS.includes(pathname) && !isMapTilesPlanProductionReady()) {
    return mapTilesPlanUnavailableResponse(pathname);
  }

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
