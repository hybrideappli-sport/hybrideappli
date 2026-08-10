import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { ConsentInputSchema } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hashIp, getUserAgent } from "@/lib/api/ip-hash";

export const dynamic = "force-dynamic";

const LOCALE = "fr";

/**
 * `POST /api/v1/consents` (AC3, ADR-010 §1-2, ADR-012 §1) — consentement santé, SÉPARÉ du
 * disclaimer. La version n'est pas fournie par le client : le serveur résout `is_current`,
 * calcule `ip_hash`/`user_agent`, insère en `service_role`.
 *
 * Retrait (`granted: false`) hors périmètre de ce lot — voir `POST /consents/:code/revoke`
 * (`08-architecture.md` §6.7), Lot L4/L5.
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = ConsentInputSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Entrée de consentement invalide.", parsed.error.issues);

  if (!parsed.data.granted) {
    return apiError(400, "VALIDATION_FAILED", "Le retrait de consentement passe par POST /api/v1/consents/:code/revoke.");
  }

  const { data: currentDocument, error: documentError } = await supabase
    .from("consent_documents")
    .select("version, locale")
    .eq("code", parsed.data.code)
    .eq("locale", LOCALE)
    .eq("is_current", true)
    .maybeSingle();
  if (documentError) return apiError(500, "INTERNAL_ERROR", documentError.message);
  if (!currentDocument) {
    console.error(`[consents] aucun document '${parsed.data.code}' is_current=true pour locale='${LOCALE}'.`);
    return apiError(503, "CONSENT_DOCUMENT_UNAVAILABLE", "Ce document de consentement n'est pas encore disponible dans cet environnement.");
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: consent, error: consentError } = await admin
    .from("consents")
    .insert({
      user_id: user.id,
      document_code: parsed.data.code,
      document_version: currentDocument.version,
      locale: currentDocument.locale,
      granted: true,
      ip_hash: hashIp(request),
      user_agent: getUserAgent(request),
    })
    .select("id")
    .single();
  if (consentError) return apiError(500, "INTERNAL_ERROR", consentError.message);

  // AC3 — le consentement santé fait avancer l'onboarding vers le récap, s'il est en cours à
  // cette étape précise (ne touche à rien d'autre : `terms`/`privacy` n'ont pas cet effet).
  if (parsed.data.code === "health_data_processing") {
    const { data: session } = await supabase
      .from("onboarding_sessions")
      .select("id, current_step")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (session?.current_step === "health_consent") {
      await supabase.from("onboarding_sessions").update({ current_step: "review" }).eq("id", session.id);
    }
  }

  return apiJson({ consentId: consent.id, documentVersion: currentDocument.version });
}
