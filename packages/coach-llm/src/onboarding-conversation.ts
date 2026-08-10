/**
 * `runOnboardingTurn()` — orchestration d'un tour de conversation d'onboarding (ADR-002 §2,
 * "Onboarding conversationnel"). Valide TOUJOURS l'extraction proposée par le fournisseur avec
 * `ProfileDraftPatchSchema` avant de la retourner à l'appelant : une extraction non conforme au
 * schéma n'est jamais retournée telle quelle — elle est écartée et le tour est traité comme une
 * reformulation (`profile-extraction.test.ts`).
 *
 * Ne persiste rien : c'est l'appelant (route `/onboarding/session/:id/messages`) qui écrit dans
 * `onboarding_sessions.profile_draft` et `onboarding_messages`.
 */

import { ProfileDraftPatchSchema, type ProfileDraftPatch } from "@hybride/domain";

import type { ConversationHistoryEntry, LlmProvider } from "./llm-provider";

/** R6 du plan (`plans/US-01-...md` §5) — borne de tours avant repli sur une question fermée. */
export const MAX_REFORMULATIONS_BEFORE_CLOSED_QUESTION = 2;

export interface OnboardingTurnRequest {
  step: string;
  history: ConversationHistoryEntry[];
  profileDraft: Record<string, unknown>;
  userMessage: string;
  reformulationCount: number;
}

export interface OnboardingTurnResult {
  reply: string;
  isReformulation: boolean;
  /** `null` si rien n'a pu être extrait ou si l'extraction proposée était invalide. */
  extractionPatch: ProfileDraftPatch | null;
  suggestNextStep: boolean;
  reformulationCount: number;
  reachedReformulationLimit: boolean;
}

export async function runOnboardingTurn(
  provider: LlmProvider,
  request: OnboardingTurnRequest,
): Promise<OnboardingTurnResult> {
  const output = await provider.converseOnboarding({
    step: request.step,
    history: request.history,
    profileDraft: request.profileDraft,
    userMessage: request.userMessage,
  });

  let extractionPatch: ProfileDraftPatch | null = null;
  let extractionRejected = false;
  if (output.extraction) {
    const parsed = ProfileDraftPatchSchema.safeParse(output.extraction);
    if (parsed.success) {
      extractionPatch = parsed.data;
    } else {
      // Sortie LLM non conforme au schéma Zod : aucune persistance (ADR-002 §2). Le tour est
      // requalifié en reformulation même si le fournisseur ne l'avait pas signalé lui-même.
      extractionRejected = true;
    }
  }

  const isReformulation = output.isReformulation || (extractionRejected && extractionPatch === null);
  const reformulationCount = isReformulation ? request.reformulationCount + 1 : 0;

  return {
    reply: output.reply,
    isReformulation,
    extractionPatch,
    suggestNextStep: output.suggestNextStep && !isReformulation,
    reformulationCount,
    reachedReformulationLimit: reformulationCount >= MAX_REFORMULATIONS_BEFORE_CLOSED_QUESTION,
  };
}
