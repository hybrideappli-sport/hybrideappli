import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { RISK_FLAG_TYPES } from "@hybride/domain";

/**
 * Tables « santé » au sens de `08-architecture.md` §5.1 (policies INSERT/UPDATE conditionnées à
 * `has_active_consent(auth.uid(), 'health_data_processing')`), purgées INTÉGRALEMENT au retrait du
 * consentement santé (`POST /api/v1/consents/:code/revoke`, `08-architecture.md` §6.7) — des
 * SAISIES ponctuelles, non nécessaires à l'existence du compte.
 */
const HEALTH_DATA_TABLES_TO_PURGE_FULLY = ["session_logs", "nutrition_checkins", "body_metrics", "pain_episodes"] as const;

/**
 * Interaction B1 × B6 (contre-revue post-correction) : purger `risk_flags` SANS exception faisait
 * disparaître l'avertissement médical fixe (`fetchActiveMedicalClearanceNotice()`, AC3 — « ton
 * profil déclaré nécessite un avis médical ») dès qu'un utilisateur mineur ou avec pathologie
 * déclarée retirait son consentement santé — alors que ce même utilisateur GARDE l'accès à son plan
 * déjà généré (`plans`/`plan_versions` ne sont volontairement PAS purgés, voir plus bas). Résultat
 * avant correction : le seul utilisateur qui devrait voir cet avertissement de façon PERMANENTE
 * (rien ne le « résout » — `risk_flags` n'a aucune policy UPDATE, la résolution d'un flag est un
 * acte `service_role`) pouvait le faire disparaître par une action utilisateur normale (retrait de
 * consentement), en gardant l'usage du plan.
 *
 * Choix retenu (le plus simple des deux proposés par la contre-revue) : NE PAS purger les flags
 * `pathology`/`minor` — ce sont des drapeaux de SÉCURITÉ (ils gouvernent un avertissement médical
 * fixe, jamais du contenu généré/personnalisé par le LLM) plutôt que des données de personnalisation
 * au même titre que `session_logs`/`body_metrics`/`pain_episodes`. `pregnancy`/`eating_disorder_history`
 * (`blockCalorieDeficit`) et `other` restent purgés normalement : ces flags ne gouvernent qu'un
 * comportement de GÉNÉRATION de plan (nutrition), sans utilité tant que le compte reste en mode
 * dégradé, et aucun avertissement affiché indépendamment du paywall n'en dépend.
 */
const RISK_FLAG_TYPES_PRESERVED_ON_REVOKE = ["pathology", "minor"] as const;

/** Complément de `RISK_FLAG_TYPES_PRESERVED_ON_REVOKE` dans `RISK_FLAG_TYPES` — calculé plutôt que
 * dupliqué en dur, pour ne jamais désynchroniser silencieusement les deux listes si `@hybride/domain`
 * fait évoluer l'énumération `RISK_FLAG_TYPES` (ex: nouveau `flag_type`, oublié ici sinon). */
const RISK_FLAG_TYPES_PURGED_ON_REVOKE = RISK_FLAG_TYPES.filter(
  (t) => !(RISK_FLAG_TYPES_PRESERVED_ON_REVOKE as readonly string[]).includes(t),
);

/**
 * Purge les données de santé d'un utilisateur suite au retrait du consentement
 * `health_data_processing` — appelée par `POST /api/v1/consents/:code/revoke` UNIQUEMENT pour ce
 * code (jamais pour `medical_disclaimer`/`terms`/`privacy`).
 *
 * Choix assumé (question ouverte n°4, §12) — ce qui est purgé vs conservé :
 *   - PURGÉES intégralement : `session_logs`, `nutrition_checkins`, `body_metrics`, `pain_episodes`.
 *   - PURGÉE PARTIELLEMENT : `risk_flags`, à l'exception des flags `pathology`/`minor` (interaction
 *     B1 × B6, voir plus haut).
 *   - CONSERVÉS : `athlete_profiles` (profil déclaratif socle : sexe, taille, historique —
 *     nécessaire au calcul des plans déjà générés et à la reprise du service si l'utilisateur
 *     re-consent), `plans`/`plan_versions`/`decision_traces` (immuables, ADR-006 : le passé du
 *     coaching ne se réécrit pas rétroactivement). Purger `athlete_profiles` reviendrait à rendre
 *     le compte inutilisable, ce qui équivaut de facto à une suppression de compte déguisée — hors
 *     de la portée d'un simple retrait de consentement. Un utilisateur qui veut l'effacement complet
 *     dispose de `POST /account/delete` (`erase_account()`, art. 17).
 *   - Le mode « dégradé » qui en résulte (plus de saisie quotidienne ni d'ajustement tant que le
 *     consentement n'est pas de nouveau accordé) est explicité côté UI (`DegradedModeBanner`,
 *     `/dashboard`, `/aujourdhui`, `/compte`) plutôt que subi silencieusement.
 */
export async function purgeHealthDataOnConsentRevoke(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  for (const table of HEALTH_DATA_TABLES_TO_PURGE_FULLY) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`purgeHealthDataOnConsentRevoke: purge de '${table}' échouée : ${error.message}`);
  }

  const { error: riskFlagsPurgeError } = await admin
    .from("risk_flags")
    .delete()
    .eq("user_id", userId)
    .in("flag_type", RISK_FLAG_TYPES_PURGED_ON_REVOKE);
  if (riskFlagsPurgeError) {
    throw new Error(`purgeHealthDataOnConsentRevoke: purge de 'risk_flags' échouée : ${riskFlagsPurgeError.message}`);
  }
}
