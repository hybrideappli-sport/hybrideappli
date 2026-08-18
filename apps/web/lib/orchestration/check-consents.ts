import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { ConsentCode } from "@hybride/domain";

/** Appelle `has_active_consent()` (`docs/db-schema.md` §0.3) via RPC — jamais réimplémenté côté application. */
export async function hasActiveConsent(client: SupabaseClient<Database>, userId: string, code: ConsentCode): Promise<boolean> {
  const { data, error } = await client.rpc("has_active_consent", { p_user: userId, p_code: code });
  if (error) throw new Error(`hasActiveConsent(${code}): ${error.message}`);
  return data === true;
}

/**
 * `hasActiveConsentAsService()` — variante pour les chemins SANS session utilisateur (jobs
 * `service_role`, ex. `closeOutScheduleIncidents()`, ADR-017 §1/§9). `has_active_consent()` (la
 * fonction RPC ci-dessus) est `security definer` mais volontairement restreinte à
 * `p_user = auth.uid()` (finding I11, `0012_privilege_hardening.sql`) : un client `service_role`
 * n'a pas de `auth.uid()` (aucun JWT `sub`), donc `client.rpc('has_active_consent', …)` renvoie
 * TOUJOURS `false` quel que soit l'état réel du consentement — un job qui l'appelait obtiendrait
 * systématiquement `skipped_no_consent`, jamais `log_created`. Cette variante lit directement
 * `consents` avec le client `service_role` (déjà hors RLS par construction, comme tout le reste
 * d'un job de la file), en reproduisant EXACTEMENT la même règle que le corps SQL de
 * `has_active_consent()` : dernière ligne par `granted_at desc`, `granted and revoked_at is null`.
 */
export async function hasActiveConsentAsService(admin: SupabaseClient<Database>, userId: string, code: ConsentCode): Promise<boolean> {
  const { data, error } = await admin
    .from("consents")
    .select("granted, revoked_at")
    .eq("user_id", userId)
    .eq("document_code", code)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`hasActiveConsentAsService(${code}): ${error.message}`);
  return data !== null && data.granted && data.revoked_at === null;
}
