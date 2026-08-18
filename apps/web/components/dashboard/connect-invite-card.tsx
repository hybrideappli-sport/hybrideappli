import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

/**
 * `ConnectInviteCard` — `D-connect-invite`, AC1 (`09-design-feature2-notes.md` §1.1). Rendue
 * UNIQUEMENT si `data_regime === 'cold'` : dès la première source connectée ou déclarée, la carte
 * disparaît définitivement — l'accès permanent vit dans `/compte` (`AccountDataSourcesRow`).
 *
 * Pas de pill violet ici (le CTA plein violet est déjà pris par « Voir ma séance du jour ») : lien
 * inline accent, patron « En savoir plus → » déjà présent ailleurs dans le produit.
 */
export async function ConnectInviteCard({ userId }: { userId: string }) {
  const admin = createSupabaseServiceRoleClient();
  const { data: athleteProfile } = await admin.from("athlete_profiles").select("data_regime").eq("user_id", userId).maybeSingle();

  if ((athleteProfile?.data_regime ?? "cold") !== "cold") return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface p-5" aria-labelledby="connect-invite-title" data-testid="connect-invite-card">
      <p className="text-label text-foreground-subtle">SYNCHRONISATION</p>
      <h2 id="connect-invite-title" className="text-heading font-semibold text-foreground">
        Tes données, au même endroit.
      </h2>
      <p className="text-body text-foreground-muted">Strava, ta muscu, ta nutrition — connecte ou déclare tes sources, je m&apos;occupe du reste.</p>
      <Link
        href="/donnees"
        className="inline-flex min-h-11 w-fit items-center text-body-strong font-semibold text-accent hover:underline"
        data-testid="connect-invite-cta"
      >
        Connecter mes sources →
      </Link>
    </section>
  );
}
