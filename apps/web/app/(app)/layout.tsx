import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";

// Groupe de routes authentifiées (Dashboard, Séance/Repas du jour, Abonnement,
// Facturation, Révision — 08-architecture.md, arborescence `apps/web/app/(app)/`).
// `proxy.ts` redirige déjà les sessions absentes ; ce garde-fou est la
// deuxième ligne de défense côté Server Component (défense en profondeur).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  return <div className="min-h-screen bg-background">{children}</div>;
}
