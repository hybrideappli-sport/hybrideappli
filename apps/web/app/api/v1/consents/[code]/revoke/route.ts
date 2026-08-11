import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { CONSENT_CODES, type ConsentCode } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hashIp, getUserAgent } from "@/lib/api/ip-hash";

export const dynamic = "force-dynamic";

const LOCALE = "fr";

/**
 * Tables « santé » au sens de `08-architecture.md` §5.1 (policies INSERT/UPDATE conditionnées à
 * `has_active_consent(auth.uid(), 'health_data_processing')`). Le retrait du consentement santé
 * ferme déjà l'écriture au niveau RLS (défense en profondeur) — cette route purge en plus les
 * SAISIES déjà enregistrées, conformément à `consent_documents.health_data_processing` (« Le
 * retrait entraîne la purge de ces données ») et à `08-architecture.md` §6.7.
 *
 * Choix assumé (question ouverte n°4, §12) — ce qui est purgé vs conservé :
 *   - PURGÉES : `session_logs`, `nutrition_checkins`, `body_metrics`, `pain_episodes`,
 *     `risk_flags` — des SAISIES ponctuelles, non nécessaires à l'existence du compte.
 *   - CONSERVÉS : `athlete_profiles` (profil déclaratif socle : sexe, taille, historique —
 *     nécessaire au calcul des plans déjà générés et à la reprise du service si l'utilisateur
 *     re-consent), `plans`/`plan_versions`/`decision_traces` (immuables, ADR-006 : le passé du
 *     coaching ne se réécrit pas rétroactivement). Purger `athlete_profiles` reviendrait à rendre
 *     le compte inutilisable, ce qui équivaut de facto à une suppression de compte déguisée —
 *     hors de la portée d'un simple retrait de consentement. Un utilisateur qui veut l'effacement
 *     complet dispose de `POST /account/delete` (`erase_account()`, art. 17).
 *   - Le mode « dégradé » qui en résulte (plus de saisie quotidienne ni d'ajustement tant que le
 *     consentement n'est pas de nouveau accordé) est explicité côté UI (`DegradedModeBanner`,
 *     `/dashboard`, `/aujourdhui`, `/compte`) plutôt que subi silencieusement.
 */
const HEALTH_DATA_TABLES_TO_PURGE = ["session_logs", "nutrition_checkins", "body_metrics", "pain_episodes", "risk_flags"] as const;

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  if (!(CONSENT_CODES as readonly string[]).includes(rawCode)) {
    return apiError(400, "VALIDATION_FAILED", "Code de consentement inconnu.");
  }
  const code = rawCode as ConsentCode;

  const admin = createSupabaseServiceRoleClient();

  const { data: currentDocument, error: documentError } = await admin
    .from("consent_documents")
    .select("version, locale")
    .eq("code", code)
    .eq("locale", LOCALE)
    .eq("is_current", true)
    .maybeSingle();
  if (documentError) return apiError(500, "INTERNAL_ERROR", documentError.message);
  if (!currentDocument) {
    console.error(`[consents/revoke] aucun document '${code}' is_current=true pour locale='${LOCALE}'.`);
    return apiError(503, "CONSENT_DOCUMENT_UNAVAILABLE", "Ce document de consentement n'est pas encore disponible dans cet environnement.");
  }

  // `08-architecture.md` §6.7 — retrait = NOUVELLE ligne `granted = false`, jamais un UPDATE
  // (`consents` est append-only, `forbid_mutation()`).
  const { data: revoked, error: revokeError } = await admin
    .from("consents")
    .insert({
      user_id: user.id,
      document_code: code,
      document_version: currentDocument.version,
      locale: currentDocument.locale,
      granted: false,
      ip_hash: hashIp(request),
      user_agent: getUserAgent(request),
    })
    .select("id, granted_at")
    .single();
  if (revokeError) return apiError(500, "INTERNAL_ERROR", revokeError.message);

  if (code === "health_data_processing") {
    for (const table of HEALTH_DATA_TABLES_TO_PURGE) {
      const { error: purgeError } = await admin.from(table).delete().eq("user_id", user.id);
      if (purgeError) return apiError(500, "INTERNAL_ERROR", `Retrait enregistré mais purge de '${table}' échouée : ${purgeError.message}`);
    }
  }

  return apiJson({ revokedAt: revoked.granted_at, purged: code === "health_data_processing" });
}
