import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";

// Groupe de routes de l'onboarding (chat, disclaimer, consentement, récap — `08-architecture.md`
// arborescence `apps/web/app/onboarding/`). `proxy.ts` protège déjà `/onboarding/*` ; deuxième
// ligne de défense côté Server Component (même pattern que `(app)/layout.tsx`, Lot L1).
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-6">{children}</main>
    </div>
  );
}
