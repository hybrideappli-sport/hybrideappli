import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

// Échange le code renvoyé par Supabase Auth (confirmation d'inscription,
// lien de réinitialisation de mot de passe) contre une session, puis
// redirige vers `next` (par défaut le Dashboard).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=auth_callback_failed`);
}
