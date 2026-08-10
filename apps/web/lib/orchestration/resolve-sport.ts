import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

/**
 * Résout un `sports.code` déclaré en onboarding vers un `sports.id`. Le référentiel `sports` est
 * en écriture `service_role` uniquement (`docs/db-schema.md` §2) — un sport hors référentiel
 * (question ouverte n°7, `08-architecture.md` §12) est donc créé ici, via l'admin, avec
 * `is_documented = false` : le moteur applique alors un profil générique prudent plutôt que de
 * refuser l'onboarding pour un sport rare non documenté par le fondateur.
 */
export async function resolveOrCreateSport(
  admin: SupabaseClient<Database>,
  code: string,
  label?: string,
): Promise<string> {
  const normalizedCode = code.trim().toLowerCase();

  const { data: existing, error: lookupError } = await admin.from("sports").select("id").eq("code", normalizedCode).maybeSingle();
  if (lookupError) throw new Error(`resolveOrCreateSport: lookup — ${lookupError.message}`);
  if (existing) return existing.id;

  const { data: created, error: insertError } = await admin
    .from("sports")
    .insert({
      code: normalizedCode,
      label_fr: label?.trim() || normalizedCode,
      family: "mixed",
      default_muscle_groups: ["full_body"],
      is_documented: false,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`resolveOrCreateSport: insert — ${insertError.message}`);
  return created.id;
}
