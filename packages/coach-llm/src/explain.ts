/**
 * `renderExplanation()` — l'orchestration ADR-002 §3 : tente le rendu LLM, contrôle son
 * intégrité numérique, retombe SYSTÉMATIQUEMENT sur le template déterministe en cas d'échec
 * réseau, de latence, ou de nombre halluciné. Le produit n'est donc jamais bloqué par le LLM, et
 * ne peut jamais afficher un chiffre que le moteur n'a pas calculé.
 */

import type { LlmProvider } from "./llm-provider.js";
import { checkNumericIntegrity } from "./numeric-integrity.js";
import { renderTemplateExplanation } from "./template-explanation.js";
import type { ExplanationSubjectType, LlmTraceInput } from "./types.js";

export interface RenderExplanationInput {
  subjectType: ExplanationSubjectType;
  traces: readonly LlmTraceInput[];
  /** Identifiant de corrélation éphémère, PAS un `user_id` (ADR-010 §4). */
  correlationId: string;
}

export interface RenderExplanationOutput {
  shortText: string;
  longText: string;
  generatedBy: "llm" | "template";
  numericIntegrityOk: boolean;
  fallbackUsed: boolean;
  /** `null` si le rendu template a été utilisé faute d'appel LLM réussi. */
  llmModel: string | null;
}

export async function renderExplanation(
  provider: LlmProvider,
  input: RenderExplanationInput,
): Promise<RenderExplanationOutput> {
  if (input.traces.length === 0) {
    throw new Error(`renderExplanation: au moins une DecisionTrace est requise (subject=${input.subjectType}).`);
  }

  try {
    const llmOutput = await provider.renderExplanation({
      subjectType: input.subjectType,
      traces: input.traces,
      correlationId: input.correlationId,
    });

    const shortCheck = checkNumericIntegrity(llmOutput.shortText, input.traces);
    const longCheck = checkNumericIntegrity(llmOutput.longText, input.traces);

    if (shortCheck.ok && longCheck.ok) {
      return {
        shortText: llmOutput.shortText,
        longText: llmOutput.longText,
        generatedBy: "llm",
        numericIntegrityOk: true,
        fallbackUsed: false,
        llmModel: provider.name,
      };
    }

    // Nombre halluciné, absent ou altéré (ADR-002 §3) — repli template, jamais propagé.
    const template = renderTemplateExplanation(input);
    return {
      ...template,
      generatedBy: "template",
      numericIntegrityOk: false,
      fallbackUsed: true,
      llmModel: provider.name,
    };
  } catch {
    // Panne / latence / timeout du fournisseur — dégradation gracieuse, jamais d'échec propagé
    // (ADR-002 §3, ADR-011 §4).
    const template = renderTemplateExplanation(input);
    return {
      ...template,
      generatedBy: "template",
      numericIntegrityOk: true,
      fallbackUsed: true,
      llmModel: null,
    };
  }
}
