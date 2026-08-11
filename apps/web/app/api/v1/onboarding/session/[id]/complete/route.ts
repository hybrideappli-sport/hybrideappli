import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { ConfirmedProfileSchema, type CompleteOnboardingResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { hasActiveConsent } from "@/lib/orchestration/check-consents";
import { completeOnboarding, OnboardingPersistenceError } from "@/lib/orchestration/complete-onboarding";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({ confirmedProfile: ConfirmedProfileSchema });

/**
 * `POST /api/v1/onboarding/session/:id/complete` (AC1/AC2) — l'utilisateur valide, PAS le LLM
 * (`08-architecture.md` §6.1). Persiste le profil déclaratif puis déclenche
 * `regeneratePlan('onboarding')`, qui bifurque vers la négociation d'objectif si le moteur juge la
 * cible irréaliste (AC2) — jamais de plan silencieusement inatteignable.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Profil confirmé invalide.", parsed.error.issues);

  const { data: session, error: sessionError } = await supabase
    .from("onboarding_sessions")
    .select("id, status, current_step")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError) return apiError(500, "INTERNAL_ERROR", sessionError.message);
  if (!session) return apiError(404, "NOT_FOUND", "Session d'onboarding introuvable.");
  if (session.status !== "in_progress") {
    return apiError(409, "CONFLICT", "Cette session d'onboarding est déjà terminée.");
  }
  if (session.current_step !== "review") {
    return apiError(409, "CONFLICT", "Le disclaimer et le consentement santé doivent être acquittés avant de valider le profil.");
  }

  // Défense en profondeur : le gating par étape garantit déjà cet ordre, on le revérifie ici
  // explicitement (AC3) plutôt que de compter uniquement sur l'ordre des écrans côté client.
  const [disclaimerOk, healthConsentOk] = await Promise.all([
    hasActiveConsent(supabase, user.id, "medical_disclaimer"),
    hasActiveConsent(supabase, user.id, "health_data_processing"),
  ]);
  if (!disclaimerOk || !healthConsentOk) {
    return apiError(403, "CONSENT_REQUIRED", "Le disclaimer et le consentement santé doivent être acquittés avant de continuer.");
  }

  const admin = createSupabaseServiceRoleClient();

  let objectiveId: string;
  try {
    const result = await completeOnboarding(supabase, admin, { userId: user.id, profile: parsed.data.confirmedProfile });
    objectiveId = result.objectiveId;
  } catch (error) {
    if (error instanceof OnboardingPersistenceError) {
      if (error.message.toLowerCase().includes("row-level security")) {
        return apiError(403, "CONSENT_REQUIRED", "Écriture refusée : consentement santé requis.");
      }
      return apiError(500, "INTERNAL_ERROR", error.message);
    }
    throw error;
  }

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const result = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });

  // `status`/`current_step` réservés au `service_role` depuis la migration 0012 (finding B5).
  const { error: sessionCompleteError } = await admin
    .from("onboarding_sessions")
    .update({ status: "completed", current_step: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (sessionCompleteError) return apiError(500, "INTERNAL_ERROR", sessionCompleteError.message);

  return apiJson<CompleteOnboardingResponse>(result);
}
