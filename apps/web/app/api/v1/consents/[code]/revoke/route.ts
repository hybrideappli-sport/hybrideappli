import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { CONSENT_CODES, type ConsentCode } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hashIp, getUserAgent } from "@/lib/api/ip-hash";
import { purgeHealthDataOnConsentRevoke } from "@/lib/orchestration/purge-health-data-on-revoke";

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

  return apiJson({ revokedAt: revoked.granted_at, purged: code === "health_data_processing" });
}
