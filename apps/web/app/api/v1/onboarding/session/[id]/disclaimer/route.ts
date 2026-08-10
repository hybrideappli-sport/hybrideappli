import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { DisclaimerAckInputSchema } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hashIp, getUserAgent } from "@/lib/api/ip-hash";

export const dynamic = "force-dynamic";

const DISCLAIMER_CODE = "medical_disclaimer";
const LOCALE = "fr";

/**
 * `POST /api/v1/onboarding/session/:id/disclaimer` (AC3) — écran BLOQUANT dédié, distinct du
 * consentement santé (ADR-010 §2-3). Écrit `consents` en `service_role` après avoir vérifié que
 * `documentVersion` (envoyé par le client, affiché à l'écran) est bien la version EN VIGUEUR
 * résolue côté serveur — jamais le client qui choisit le texte qu'il acquitte (ADR-010 §1, §9).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = DisclaimerAckInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Version de document manquante.", parsed.error.issues);

  const { data: session, error: sessionError } = await supabase
    .from("onboarding_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError) return apiError(500, "INTERNAL_ERROR", sessionError.message);
  if (!session) return apiError(404, "NOT_FOUND", "Session d'onboarding introuvable.");
  if (session.status !== "in_progress") return apiError(409, "CONFLICT", "Cette session d'onboarding est déjà terminée.");

  const { data: currentDocument, error: documentError } = await supabase
    .from("consent_documents")
    .select("version, locale")
    .eq("code", DISCLAIMER_CODE)
    .eq("locale", LOCALE)
    .eq("is_current", true)
    .maybeSingle();
  if (documentError) return apiError(500, "INTERNAL_ERROR", documentError.message);
  if (!currentDocument) {
    // ADR-010 §9 — aucun document EN VIGUEUR : l'environnement se diagnostique, il ne plante pas.
    console.error(`[onboarding/disclaimer] aucun document '${DISCLAIMER_CODE}' is_current=true pour locale='${LOCALE}'.`);
    return apiError(503, "CONSENT_DOCUMENT_UNAVAILABLE", "Le disclaimer n'est pas encore disponible dans cet environnement.");
  }

  if (parsed.data.documentVersion !== currentDocument.version) {
    return apiError(
      409,
      "CONFLICT",
      "La version du disclaimer a changé pendant l'onboarding — merci de recharger l'écran avant d'acquitter.",
    );
  }

  const admin = createSupabaseServiceRoleClient();
  const { error: consentError } = await admin.from("consents").insert({
    user_id: user.id,
    document_code: DISCLAIMER_CODE,
    document_version: currentDocument.version,
    locale: currentDocument.locale,
    granted: true,
    ip_hash: hashIp(request),
    user_agent: getUserAgent(request),
  });
  if (consentError) return apiError(500, "INTERNAL_ERROR", consentError.message);

  const { error: stepError } = await supabase
    .from("onboarding_sessions")
    .update({ current_step: "health_consent" })
    .eq("id", sessionId);
  if (stepError) return apiError(500, "INTERNAL_ERROR", stepError.message);

  return apiJson({ acknowledged: true });
}
