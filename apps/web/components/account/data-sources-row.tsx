import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@hybride/db/server";

/**
 * `AccountDataSourcesRow` — AC1, `09-design-feature2-notes.md` §1.2. Ligne TOUJOURS visible, quel
 * que soit le régime de données (accès permanent, contrairement à `ConnectInviteCard` qui disparaît
 * dès la première source). Route vers `/donnees`, qui porte aussi la déconnexion (AC10).
 */
export async function AccountDataSourcesRow({ userId }: { userId: string }) {
  const admin = createSupabaseServiceRoleClient();

  const [{ count: activeCount }, { data: athleteProfile }] = await Promise.all([
    admin.from("data_connections").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    admin.from("athlete_profiles").select("data_regime").eq("user_id", userId).maybeSingle(),
  ]);

  const connected = activeCount ?? 0;
  const regime = athleteProfile?.data_regime ?? "cold";
  const value = connected > 0 ? `${connected} connectée${connected > 1 ? "s" : ""}` : regime === "declared" ? "Saisie manuelle" : "Aucune";

  return (
    <Link
      href="/donnees"
      className="flex min-h-14 items-center justify-between gap-2 rounded-lg bg-surface px-5 py-4 hover:bg-surface-raised"
      aria-label={`Sources de données, ${value}`}
      data-testid="account-data-sources-row"
    >
      <span className="text-body text-foreground">Sources de données</span>
      <span className="flex items-center gap-2 text-small text-foreground-muted">
        {value}
        <span aria-hidden="true" className="text-foreground-subtle">
          ›
        </span>
      </span>
    </Link>
  );
}
