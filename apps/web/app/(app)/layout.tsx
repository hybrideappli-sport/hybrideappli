import { redirect } from "next/navigation";

import { TabBar } from "@/components/layout/tab-bar";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Groupe de routes authentifiées (Dashboard, Séance/Repas du jour, Planning, Abonnement,
// Facturation, Révision — 08-architecture.md, arborescence `apps/web/app/(app)/`).
// `proxy.ts` redirige déjà les sessions absentes ; ce garde-fou est la
// deuxième ligne de défense côté Server Component (défense en profondeur).
//
// US-03 — `<TabBar>` : tab bar réelle (`08-architecture.md` §12 question 20), rendue pour tout le
// groupe mais auto-masquée hors des 4 écrans racines (`components/layout/tab-bar.tsx`). `pb-16`
// laisse la place à la barre fixe sans qu'aucun écran n'ait à s'en soucier individuellement.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {children}
      <TabBar />
    </div>
  );
}
