import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { hasActiveConsent } from "./check-consents";

/**
 * Statut du consentement santé de l'utilisateur — question ouverte n°4 (`08-architecture.md`
 * §12) : « mode dégradé après retrait du consentement santé », non spécifié par les 14 AC.
 *
 * Arbitrage retenu (`developer`, tranché faute de spécification produit dédiée) : un retrait de
 * consentement ne bloque PAS l'accès à l'application (le plan déjà généré reste consultable), mais
 * ferme la SAISIE de nouvelles données de santé (déjà appliqué au niveau RLS,
 * `docs/db-schema.md` §5.1 — policies `INSERT`/`UPDATE` conditionnées) et purge les saisies
 * passées (`POST /api/v1/consents/:code/revoke`). Le mode dégradé est rendu EXPLICITE plutôt que
 * subi silencieusement : `DegradedModeBanner` l'affiche sur les écrans où la saisie serait sinon
 * silencieusement refusée par PostgreSQL (`/dashboard`, `/aujourdhui`), avec un chemin direct de
 * retour au consentement (`/compte`).
 */
export async function isHealthConsentActive(client: SupabaseClient<Database>, userId: string): Promise<boolean> {
  return hasActiveConsent(client, userId, "health_data_processing");
}
