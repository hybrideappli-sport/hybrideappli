/**
 * Provider LLM en erreur ⟹ explication template produite, jamais d'échec propagé
 * (`plans/US-01-...md` §4.2).
 */

import { describe, expect, it } from "vitest";

import { renderExplanation } from "../explain.js";
import { renderTemplateExplanation } from "../template-explanation.js";
import type { ExplanationOutput, ExplanationRequest, LlmProvider } from "../llm-provider.js";
import type { LlmTraceInput } from "../types.js";

const TRACE: LlmTraceInput = {
  ruleId: "nutrition.kcal_target",
  category: "nutrition",
  conditionExpr: "modulation_reason = 'intensity'",
  inputs: [{ field: "kcal_safety_floor", value: 1500 }],
  output: { field: "kcal_target", before: 2200, after: 2400, direction: "increase" },
};

function throwingProvider(error: Error): LlmProvider {
  return {
    name: "flaky",
    converseOnboarding: () => {
      throw new Error("not used in this test");
    },
    renderExplanation: (_input: ExplanationRequest): Promise<ExplanationOutput> => Promise.reject(error),
  };
}

describe("renderExplanation — repli template (panne / latence du fournisseur)", () => {
  it("ne propage jamais l'échec du fournisseur : retombe sur le template", async () => {
    const provider = throwingProvider(new Error("ECONNRESET"));

    const result = await renderExplanation(provider, {
      subjectType: "nutrition_day",
      traces: [TRACE],
      correlationId: "corr-1",
    });

    expect(result.generatedBy).toBe("template");
    expect(result.fallbackUsed).toBe(true);
    expect(result.llmModel).toBeNull();
    // Le contrôle d'intégrité n'a rien à rejeter ici : aucun texte LLM n'a été produit.
    expect(result.numericIntegrityOk).toBe(true);
  });

  it("produit exactement le même texte que renderTemplateExplanation() en cas de panne", async () => {
    const provider = throwingProvider(new Error("timeout"));
    const expected = renderTemplateExplanation({ subjectType: "nutrition_day", traces: [TRACE] });

    const result = await renderExplanation(provider, {
      subjectType: "nutrition_day",
      traces: [TRACE],
      correlationId: "corr-2",
    });

    expect(result.shortText).toBe(expected.shortText);
    expect(result.longText).toBe(expected.longText);
  });

  it("renderExplanation exige au moins une DecisionTrace (jamais d'explication non fondée)", async () => {
    const provider = throwingProvider(new Error("n/a"));
    await expect(
      renderExplanation(provider, { subjectType: "planned_session", traces: [], correlationId: "corr-3" }),
    ).rejects.toThrow(/au moins une DecisionTrace/);
  });

  it("timeout explicite (latence budgétaire dépassée) retombe aussi sur le template", async () => {
    function timeoutProvider(): LlmProvider {
      return {
        name: "slow",
        converseOnboarding: () => {
          throw new Error("not used");
        },
        renderExplanation: () => new Promise((_resolve, reject) => reject(new Error("timeout budget exceeded"))),
      };
    }

    const result = await renderExplanation(timeoutProvider(), {
      subjectType: "planned_session",
      traces: [TRACE],
      correlationId: "corr-4",
    });

    expect(result.fallbackUsed).toBe(true);
    expect(result.generatedBy).toBe("template");
  });
});
