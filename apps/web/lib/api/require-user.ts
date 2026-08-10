import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase/server";

/** Authentification par session Supabase (cookie) — `401` sinon (`08-architecture.md` §6). */
export async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}
