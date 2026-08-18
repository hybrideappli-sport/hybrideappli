import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { CONSENT_CODES, type ConsentCode } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hashIp, getUserAgent } from "@/lib/api/ip-hash";
import { purgeHealthDataOnConsentRevoke } from "@/lib/orchestration/purge-health-data-on-revoke";
import { disconnectAllDataConnections } from "@/lib/data/disconnect-data-connection";

export const dynamic = "force-dynamic";

const LOCALE = "fr";

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
    try {
      await purgeHealthDataOnConsentRevoke(admin, user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return apiError(500, "INTERNAL_ERROR", `Retrait enregistré mais purge des données de santé échouée : ${message}`);
    }
  }

  // US-02, ADR-013 §5 — retrait de `third_party_data_import` : révocation EN CASCADE de TOUTES les
  // connexions actives/en attente (jetons supprimés localement, révocation tentée chez le
  // fournisseur). Les données déjà importées sont CONSERVÉES (AC10) — même comportement qu'une
  // déconnexion individuelle, `disconnectDataConnection()` est le chemin unique.
  if (code === "third_party_data_import") {
    try {
      await disconnectAllDataConnections(admin, user.id, "consent_withdrawn");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return apiError(500, "INTERNAL_ERROR", `Retrait enregistré mais révocation des connexions échouée : ${message}`);
    }
  }

  return apiJson({ revokedAt: revoked.granted_at, purged: code === "health_data_processing" });
}
