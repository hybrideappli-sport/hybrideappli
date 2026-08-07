import type { Metadata } from "next";

import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard — Hybride Club",
};

// Placeholder du Lot L1 (socle) : prouve que le parcours d'authentification
// aboutit à une route protégée. Le vrai Dashboard (plan du jour mis en
// avant, paywall, etc. — AC1, AC5, AC13) est construit au Lot L4.
export default async function DashboardPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="text-sm text-neutral-600">Connecté en tant que {user?.email}.</p>
      <form action={signOutAction}>
        <Button type="submit" variant="secondary">
          Se déconnecter
        </Button>
      </form>
    </main>
  );
}
