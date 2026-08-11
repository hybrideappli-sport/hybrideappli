import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { OnboardingMessageView, OnboardingSessionView, ProfileDraft } from "@hybride/domain";

import { getLlmProvider } from "@/lib/coach-llm-provider";
import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/onboarding/session` (`08-architecture.md` §6.1) — crée ou reprend la session
 * d'onboarding en cours de l'utilisateur. Une session `in_progress` existante est reprise telle
 * quelle (ADR-010 §3 : l'ordre des étapes, y compris disclaimer/consentement, est porté par
 * `current_step`, jamais réinitialisé silencieusement).
 */
export async function POST() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: existing, error: lookupError } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) return apiError(500, "INTERNAL_ERROR", lookupError.message);

  if (existing) {
    const { data: messages, error: messagesError } = await supabase
      .from("onboarding_messages")
      .select("*")
      .eq("session_id", existing.id)
      .order("created_at", { ascending: true });
    if (messagesError) return apiError(500, "INTERNAL_ERROR", messagesError.message);

    return apiJson<OnboardingSessionView>({
      sessionId: existing.id,
      status: existing.status,
      step: existing.current_step,
      profileDraft: existing.profile_draft as ProfileDraft,
      messages: (messages ?? []).map(toMessageView),
    });
  }

  const { data: created, error: createError } = await supabase
    .from("onboarding_sessions")
    .insert({ user_id: user.id })
    .select("*")
    .single();

  if (createError) {
    // Violation de `onboarding_sessions_one_in_progress` (23505) : un appel concurrent (double
    // montage d'effet React, double onglet) a créé la session en premier — on la relit plutôt que
    // d'échouer (voir `docs/db-schema.md`, Journal des révisions 2026-08-10, R7).
    if (createError.code === "23505") {
      const { data: winner, error: winnerError } = await supabase
        .from("onboarding_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .single();
      if (winnerError) return apiError(500, "INTERNAL_ERROR", winnerError.message);

      const { data: messages, error: messagesError } = await supabase
        .from("onboarding_messages")
        .select("*")
        .eq("session_id", winner.id)
        .order("created_at", { ascending: true });
      if (messagesError) return apiError(500, "INTERNAL_ERROR", messagesError.message);

      return apiJson<OnboardingSessionView>({
        sessionId: winner.id,
        status: winner.status,
        step: winner.current_step,
        profileDraft: winner.profile_draft as ProfileDraft,
        messages: (messages ?? []).map(toMessageView),
      });
    }
    return apiError(500, "INTERNAL_ERROR", createError.message);
  }

  // Message d'accueil — pas de tour utilisateur préalable, l'étape `intro` bascule directement
  // vers la première vraie question (`goal`), voir `DeterministicMockLlmProvider`.
  const provider = getLlmProvider();
  const turnStartedAt = Date.now();
  const introOutput = await provider.converseOnboarding({ step: "intro", history: [], profileDraft: {}, userMessage: "" });

  const { data: welcomeMessage, error: welcomeError } = await supabase
    .from("onboarding_messages")
    .insert({
      session_id: created.id,
      user_id: user.id,
      role: "coach",
      content: introOutput.reply,
      step: "goal",
      latency_ms: Date.now() - turnStartedAt,
    })
    .select("*")
    .single();
  if (welcomeError) return apiError(500, "INTERNAL_ERROR", welcomeError.message);

  // `current_step` est réservé au `service_role` depuis la migration 0012 (finding B5) : c'est un
  // état de PROGRESSION, pas un brouillon — seul `profile_draft` reste écrit par le client RLS.
  const admin = createSupabaseServiceRoleClient();
  const { error: stepError } = await admin.from("onboarding_sessions").update({ current_step: "goal" }).eq("id", created.id);
  if (stepError) return apiError(500, "INTERNAL_ERROR", stepError.message);

  return apiJson<OnboardingSessionView>({
    sessionId: created.id,
    status: created.status,
    step: "goal",
    profileDraft: {},
    messages: [toMessageView(welcomeMessage)],
  });
}

function toMessageView(row: {
  id: string;
  role: string;
  content: string;
  step: string | null;
  is_reformulation: boolean;
  created_at: string;
}): OnboardingMessageView {
  return {
    id: row.id,
    role: row.role as OnboardingMessageView["role"],
    content: row.content,
    step: row.step,
    isReformulation: row.is_reformulation,
    createdAt: row.created_at,
  };
}
