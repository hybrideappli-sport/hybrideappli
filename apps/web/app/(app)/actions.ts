"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase/server";

// Mutations d'UI locales du groupe `(app)` — Server Actions réservées (plan §2 : « marquer une
// notification lue, préférences d'affichage. Aucune logique métier »). Le client RLS suffit :
// `notifications_read_own` + `grant update (read_at)` (`docs/db-schema.md` §8) couvrent déjà toute
// la sécurité nécessaire, aucun besoin du client `service_role`.
export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId);
  revalidatePath("/dashboard");
}
