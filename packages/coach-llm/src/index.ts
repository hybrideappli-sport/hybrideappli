/**
 * @hybride/coach-llm
 *
 * Port `LlmProvider` + adaptateurs + rendu template de repli + contrôle
 * d'intégrité numérique (voir ADR-002 §2-3). Trois usages seulement :
 * conversation d'onboarding, reformulation sur réponse incomprise,
 * rédaction des explications à partir de `DecisionTrace[]` déjà calculées.
 *
 * Le LLM n'a JAMAIS autorité sur le contenu chiffré du plan : ce package
 * ne dépend jamais de `@hybride/rules-engine` et ne peut jamais l'invoquer
 * (sens unique de la dépendance, ADR-002 §4).
 */

export const COACH_LLM_PACKAGE_NAME = "@hybride/coach-llm" as const;

export type {
  ConversationHistoryEntry,
  ConversationTurnInput,
  ConversationTurnOutput,
  ExplanationOutput,
  ExplanationRequest,
  LlmProvider,
} from "./llm-provider.js";
export type { ExplanationSubjectType, LlmTraceInput, LlmTraceInputField, LlmTraceOutput } from "./types.js";

export { DeterministicMockLlmProvider } from "./mock-provider.js";
export { MistralLlmProvider, type MistralLlmProviderOptions } from "./mistral-provider.js";

export {
  renderTemplateExplanation,
  type TemplateExplanationInput,
  type TemplateExplanationOutput,
} from "./template-explanation.js";
export {
  checkNumericIntegrity,
  collectGroundedNumbers,
  extractNumericLiterals,
  type NumericIntegrityResult,
} from "./numeric-integrity.js";
export { renderExplanation, type RenderExplanationInput, type RenderExplanationOutput } from "./explain.js";
export {
  runOnboardingTurn,
  MAX_REFORMULATIONS_BEFORE_CLOSED_QUESTION,
  type OnboardingTurnRequest,
  type OnboardingTurnResult,
} from "./onboarding-conversation.js";
