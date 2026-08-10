import "server-only";
import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Session d'onboarding `in_progress` de l'utilisateur courant, lue directement depuis un Server
 * Component (RLS : `onboarding_sessions_own`). Redirige vers `/onboarding/chat` si aucune session
 * n'est en cours — un utilisateur ne doit jamais atterrir sur un écran bloquant (disclaimer,
 * consentement, récap) sans être passé par le chat qui l'a fait progresser jusque-là.
 */
export async function getCurrentOnboardingSession() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: session } = await supabase
    .from("onboarding_sessions")
    .select("id, current_step, profile_draft")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) redirect("/onboarding/chat");

  return { userId: user.id, session };
}
