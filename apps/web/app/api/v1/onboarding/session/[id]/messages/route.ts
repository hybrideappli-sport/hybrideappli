import { runOnboardingTurn } from "@hybride/coach-llm";
import { ONBOARDING_CHAT_STEPS, OnboardingMessageInputSchema, type OnboardingStep } from "@hybride/domain";
import type { Json } from "@hybride/db/types";

import { getLlmProvider } from "@/lib/coach-llm-provider";
import { apiError } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { sseEvent, SSE_HEADERS } from "@/lib/api/sse";
import { detectHealthDataMention } from "@/lib/onboarding/health-data-heuristic";
import { nextChatStep } from "@/lib/onboarding/next-chat-step";

export const dynamic = "force-dynamic";

/** R6 du plan (`plans/US-01-...md` §5) — borne de tours par session, coût LLM maîtrisé. */
const MAX_TURNS_PER_SESSION = 60;

type RecentMessageRow = { role: string; content: string; step: OnboardingStep | null; is_reformulation: boolean };

function countTrailingReformulations(recentDesc: RecentMessageRow[], step: OnboardingStep): number {
  let count = 0;
  for (const message of recentDesc) {
    if (message.role !== "coach") continue;
    if (message.step !== step) break;
    if (!message.is_reformulation) break;
    count++;
  }
  return count;
}

/**
 * `POST /api/v1/onboarding/session/:id/messages` (`08-architecture.md` §6.1) — SSE :
 * `token` → `draft_patch` → `next_step`. Rate limité (borne de tours, R6 du plan).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsedInput = OnboardingMessageInputSchema.safeParse(rawBody);
  if (!parsedInput.success) {
    return apiError(400, "VALIDATION_FAILED", "Message invalide.", parsedInput.error.issues);
  }

  const { data: session, error: sessionError } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (sessionError) return apiError(500, "INTERNAL_ERROR", sessionError.message);
  if (!session) return apiError(404, "NOT_FOUND", "Session d'onboarding introuvable.");
  if (session.status !== "in_progress") {
    return apiError(409, "CONFLICT", "Cette session d'onboarding est déjà terminée.");
  }
  if (!(ONBOARDING_CHAT_STEPS as readonly string[]).includes(session.current_step)) {
    return apiError(409, "CONFLICT", "Cette étape ne se répond pas dans le chat (disclaimer/consentement/récap).");
  }
  if (session.turn_count >= MAX_TURNS_PER_SESSION) {
    return apiError(429, "RATE_LIMITED", "Nombre maximal d'échanges atteint pour cette session.");
  }

  const currentStep = session.current_step;
  const containsHealthData = detectHealthDataMention(parsedInput.data.content);

  const { error: userMessageError } = await supabase.from("onboarding_messages").insert({
    session_id: sessionId,
    user_id: user.id,
    role: "user",
    content: parsedInput.data.content,
    step: currentStep,
    contains_health_data: containsHealthData,
  });
  if (userMessageError) return apiError(500, "INTERNAL_ERROR", userMessageError.message);

  const { data: recentRows, error: recentError } = await supabase
    .from("onboarding_messages")
    .select("role, content, step, is_reformulation")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (recentError) return apiError(500, "INTERNAL_ERROR", recentError.message);

  const recentDesc = (recentRows ?? []) as RecentMessageRow[];
  const history = recentDesc
    .filter((m) => m.role === "coach" || m.role === "user")
    .reverse()
    .map((m) => ({ role: m.role as "coach" | "user", content: m.content }));
  const reformulationCount = countTrailingReformulations(recentDesc, currentStep);

  const provider = getLlmProvider();
  const turnStartedAt = Date.now();
  const turn = await runOnboardingTurn(provider, {
    step: currentStep,
    history,
    profileDraft: (session.profile_draft as Record<string, unknown>) ?? {},
    userMessage: parsedInput.data.content,
    reformulationCount,
  });

  const mergedDraft: Record<string, unknown> = turn.extractionPatch
    ? { ...((session.profile_draft as Record<string, unknown>) ?? {}), ...turn.extractionPatch }
    : ((session.profile_draft as Record<string, unknown>) ?? {});
  const nextStep: OnboardingStep = turn.suggestNextStep ? nextChatStep(currentStep) : currentStep;

  const { data: coachMessage, error: coachMessageError } = await supabase
    .from("onboarding_messages")
    .insert({
      session_id: sessionId,
      user_id: user.id,
      role: "coach",
      content: turn.reply,
      step: nextStep,
      is_reformulation: turn.isReformulation,
      extraction: (turn.extractionPatch ?? null) as unknown as Json,
      latency_ms: Date.now() - turnStartedAt,
    })
    .select("id")
    .single();
  if (coachMessageError) return apiError(500, "INTERNAL_ERROR", coachMessageError.message);

  const { error: updateError } = await supabase
    .from("onboarding_sessions")
    .update({
      current_step: nextStep,
      profile_draft: mergedDraft as unknown as Json,
      turn_count: session.turn_count + 1,
    })
    .eq("id", sessionId);
  if (updateError) return apiError(500, "INTERNAL_ERROR", updateError.message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseEvent("token", { content: turn.reply })));
      controller.enqueue(
        encoder.encode(sseEvent("draft_patch", { patch: turn.extractionPatch, isReformulation: turn.isReformulation })),
      );
      controller.enqueue(encoder.encode(sseEvent("next_step", { step: nextStep, messageId: coachMessage.id })));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
