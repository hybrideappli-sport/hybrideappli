/**
 * ADR-002 §3 — un texte introduisant un nombre absent des traces est REJETÉ,
 * `fallback_used = true` (vérifié ici sur `renderExplanation`, qui orchestre le contrôle).
 */

import { describe, expect, it } from "vitest";

import { renderExplanation } from "../explain.js";
import { checkNumericIntegrity, extractNumericLiterals } from "../numeric-integrity.js";
import type { ExplanationOutput, ExplanationRequest, LlmProvider } from "../llm-provider.js";
import type { LlmTraceInput } from "../types.js";

function buildTrace(overrides: Partial<LlmTraceInput> = {}): LlmTraceInput {
  return {
    ruleId: "guardrail.weekly_load_progression_cap",
    category: "guardrail",
    conditionExpr: "targetLoad > previousLoad * (1 + cap)",
    inputs: [{ field: "weekly_load_progression_cap_pct", value: 10 }],
    output: { field: "target_load_units", before: 300, after: 330, direction: "increase" },
    ...overrides,
  };
}

function fakeProvider(explanation: ExplanationOutput | (() => Promise<ExplanationOutput>)): LlmProvider {
  return {
    name: "fake",
    converseOnboarding: () => {
      throw new Error("not used in this test");
    },
    renderExplanation: (_input: ExplanationRequest) =>
      typeof explanation === "function" ? explanation() : Promise.resolve(explanation),
  };
}

describe("extractNumericLiterals", () => {
  it("extrait les nombres entiers et décimaux (virgule ou point)", () => {
    expect(extractNumericLiterals("Charge à 330 (soit +10,5%) contre 300 avant.")).toEqual([330, 10.5, 300]);
  });

  it("ignore les groupes de chiffres appartenant à une date ISO", () => {
    expect(extractNumericLiterals("Semaine du 2026-08-10, charge 330.")).toEqual([330]);
  });
});

describe("checkNumericIntegrity", () => {
  it("accepte un texte dont tous les nombres sont couverts par les traces", () => {
    const traces = [buildTrace()];
    const result = checkNumericIntegrity("La charge passe de 300 à 330 (plafond 10%).", traces);
    expect(result.ok).toBe(true);
    expect(result.offendingNumbers).toEqual([]);
  });

  it("rejette un texte introduisant un nombre halluciné, absent des traces", () => {
    const traces = [buildTrace()];
    const result = checkNumericIntegrity("La charge passe de 300 à 350.", traces);
    expect(result.ok).toBe(false);
    expect(result.offendingNumbers).toEqual([350]);
  });
});

describe("renderExplanation — intégration du contrôle d'intégrité (ADR-002 §3)", () => {
  const traces = [buildTrace()];

  it("conserve le texte LLM quand tous les nombres sont couverts par les traces", async () => {
    const provider = fakeProvider({
      shortText: "Charge portée à 330 (contre 300), sous le plafond de 10%.",
      longText: "Détail : 300 -> 330, plafond 10% respecté.",
    });

    const result = await renderExplanation(provider, { subjectType: "planned_session", traces, correlationId: "corr-1" });

    expect(result.generatedBy).toBe("llm");
    expect(result.numericIntegrityOk).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  it("rejette l'explication LLM et retombe sur le template si un nombre est halluciné", async () => {
    const provider = fakeProvider({
      shortText: "Charge portée à 420, un record cette saison !",
      longText: "Détail : 300 -> 330.",
    });

    const result = await renderExplanation(provider, { subjectType: "planned_session", traces, correlationId: "corr-2" });

    expect(result.generatedBy).toBe("template");
    expect(result.numericIntegrityOk).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    // Le texte de repli ne contient, par construction, que des nombres des traces.
    expect(checkNumericIntegrity(result.shortText, traces).ok).toBe(true);
    expect(checkNumericIntegrity(result.longText, traces).ok).toBe(true);
  });

  it("rejette un nombre altéré même s'il ressemble à une valeur légitime (tolérance nulle)", async () => {
    // 331 n'existe dans aucune trace (avant=300, après=330) : un arrondi/décalage d'une unité
    // doit être détecté, pas seulement une valeur totalement inventée.
    const provider = fakeProvider({
      shortText: "Charge portée à 331.",
      longText: "Détail : 300 -> 330.",
    });

    const result = await renderExplanation(provider, { subjectType: "planned_session", traces, correlationId: "corr-3" });

    expect(result.numericIntegrityOk).toBe(false);
    expect(result.fallbackUsed).toBe(true);
  });
});
