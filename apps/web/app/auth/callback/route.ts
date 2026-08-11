import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveSafeRedirect } from "@/lib/safe-redirect";

// Échange le code renvoyé par Supabase Auth (confirmation d'inscription,
// lien de réinitialisation de mot de passe) contre une session, puis
// redirige vers `next` (par défaut le Dashboard).
// `next` vient d'un paramètre de requête non fiable : un `//evil.com` ou `https://evil.com`
// serait interprété par le navigateur comme une redirection vers un hôte externe (open redirect)
// — finding M3, audit Lot L1. `resolveSafeRedirect` n'accepte que des chemins locaux relatifs.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = resolveSafeRedirect(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=auth_callback_failed`);
}
