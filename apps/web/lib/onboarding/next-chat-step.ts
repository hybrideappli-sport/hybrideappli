import { ONBOARDING_CHAT_STEPS, type OnboardingStep } from "@hybride/domain";

/**
 * Étape suivante du parcours conversationnel. Après la dernière étape de chat (`risk_filter`),
 * la suite n'est PLUS conversationnelle : `disclaimer` est un écran dédié et bloquant (AC3,
 * ADR-010 §3), jamais posé comme une question de plus dans le fil de discussion.
 */
export function nextChatStep(current: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_CHAT_STEPS.indexOf(current);
  if (index === -1 || index === ONBOARDING_CHAT_STEPS.length - 1) return "disclaimer";
  return ONBOARDING_CHAT_STEPS[index + 1]!;
}
