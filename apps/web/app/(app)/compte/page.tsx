import type { Metadata } from "next";
import Link from "next/link";

import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { ExportAccountButton } from "@/components/account/export-account-button";
import { HealthConsentManager } from "@/components/account/health-consent-manager";
import { isHealthConsentActive } from "@/lib/orchestration/health-consent-status";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mon compte — Hybride Club" };
export const dynamic = "force-dynamic";

/**
 * `/compte` — droits RGPD (`08-architecture.md` §6.7) : export intégral, retrait du consentement
 * santé, suppression définitive du compte. `finding B1` de la revue post-Lot L5 : ces trois routes
 * n'avaient aucun point d'entrée applicatif avant cet écran.
 */
export default async function AccountPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // `(app)/layout.tsx` redirige déjà — défense en profondeur uniquement.

  const healthConsentActive = await isHealthConsentActive(supabase, user.id);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mon compte</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
          Dashboard
        </Link>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">Consentements</h2>
        <HealthConsentManager active={healthConsentActive} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">Mes données</h2>
        <ExportAccountButton />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">Zone de danger</h2>
        <DeleteAccountForm email={user.email ?? ""} />
      </section>
    </main>
  );
}
