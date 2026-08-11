import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { SPORT_CODE_PATTERN } from "@hybride/domain";

/** Miroir de `SportCodeSchema` (`@hybride/domain`) — voir son en-tête pour le rationnel (finding I10). */
const SPORT_CODE_MAX_LENGTH = 40;

export class InvalidSportCodeError extends Error {}

/**
 * Résout un `sports.code` déclaré en onboarding vers un `sports.id`. Le référentiel `sports` est
 * en écriture `service_role` uniquement (`docs/db-schema.md` §2) — un sport hors référentiel
 * (question ouverte n°7, `08-architecture.md` §12) est donc créé ici, via l'admin, avec
 * `is_documented = false` : le moteur applique alors un profil générique prudent plutôt que de
 * refuser l'onboarding pour un sport rare non documenté par le fondateur.
 *
 * Correction post-revue (finding I10) : `code` transite déjà par `SportCodeSchema` côté route
 * (`ConfirmedProfileSchema`), mais ce module reste le SEUL point où une donnée fournie par le
 * client franchit la frontière vers un référentiel partagé, lu par TOUS les utilisateurs
 * (`sports_read … using (true)`) — il applique donc la même borne en défense en profondeur,
 * indépendamment de tout appelant futur qui oublierait de valider en amont.
 */
export async function resolveOrCreateSport(
  admin: SupabaseClient<Database>,
  code: string,
  label?: string,
): Promise<string> {
  const normalizedCode = code.trim().toLowerCase();
  if (normalizedCode.length === 0 || normalizedCode.length > SPORT_CODE_MAX_LENGTH || !SPORT_CODE_PATTERN.test(normalizedCode)) {
    throw new InvalidSportCodeError(
      `resolveOrCreateSport: code de sport invalide ('${code}') — attendu 1 à ${SPORT_CODE_MAX_LENGTH} caractères parmi [a-z0-9_-].`,
    );
  }

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
