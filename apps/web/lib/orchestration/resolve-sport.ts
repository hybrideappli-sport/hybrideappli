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
 * `is_documented = false`, plutôt que de refuser l'onboarding pour un sport rare non documenté.
 *
 * ⚠️ `is_documented` N'EST LU NULLE PART. Ce commentaire affirmait jusqu'au 2026-09-18 que « le
 * moteur applique alors un profil générique prudent » : c'est faux, et vérifiable — le drapeau est
 * transporté jusqu'au contexte (`build-planning-context.ts:142`, `AthleteSportSnapshot`) et aucun
 * étage du pipeline ne le consulte. Le garde-fou annoncé n'existe pas.
 *
 * Ce qui se passe RÉELLEMENT pour un sport créé ici : `family = "mixed"` et
 * `default_muscle_groups = ["full_body"]`, valeurs posées ci-dessous faute de mieux. Or le moteur
 * lit `family` à quatre endroits de `09-build-sessions.ts` (cycle de types de séance, facteur de
 * charge, suivi des séances intenses, unités de charge) et `defaultMuscleGroups` pour la détection
 * d'interférence. Une discipline inconnue est donc planifiée comme un sport mixte full-body — ni
 * plus ni moins prudemment qu'un autre.
 *
 * La question n°7 reste OUVERTE, et `08-architecture.md` §12 le dit déjà : « le comportement
 * produit exact (refus vs plan prudent) reste à confirmer ». La trancher demande de définir ce que
 * « prudent » veut dire, donc de la logique moteur ET une borne au ruleset — soit une nouvelle
 * version publiée (ADR-007 : `params` porte des scalaires, jamais de la logique). Le drapeau est
 * conservé tel quel : il est le point d'accroche du jour où elle sera tranchée.
 *
 * Depuis que l'onboarding est contraint au référentiel (2026-09-18), ce chemin n'est plus atteint
 * que par des disciplines réellement absentes, et non plus par un doublon de `running`.
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
