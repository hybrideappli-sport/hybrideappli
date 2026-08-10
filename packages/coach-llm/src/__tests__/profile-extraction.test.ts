/**
 * Sortie LLM non conforme au schéma Zod ⟹ reformulation, aucune persistance
 * (`plans/US-01-...md` §4.2 ; ADR-002 §2).
 */

import { describe, expect, it } from "vitest";

import { runOnboardingTurn, MAX_REFORMULATIONS_BEFORE_CLOSED_QUESTION } from "../onboarding-conversation.js";
import type { ConversationTurnInput, ConversationTurnOutput, LlmProvider } from "../llm-provider.js";

function providerReturning(output: ConversationTurnOutput): LlmProvider {
  return {
    name: "fake",
    converseOnboarding: (_input: ConversationTurnInput) => Promise.resolve(output),
    renderExplanation: () => {
      throw new Error("not used in this test");
    },
  };
}

const baseRequest = {
  step: "level",
  history: [],
  profileDraft: {},
  userMessage: "avancé",
  reformulationCount: 0,
};

describe("runOnboardingTurn — validation Zod de l'extraction (ADR-002 §2)", () => {
  it("retourne le patch validé quand l'extraction est conforme au schéma", async () => {
    const provider = providerReturning({
      reply: "Merci, on continue.",
      isReformulation: false,
      extraction: { experienceLevel: "advanced" },
      suggestNextStep: true,
    });

    const result = await runOnboardingTurn(provider, baseRequest);

    expect(result.isReformulation).toBe(false);
    expect(result.extractionPatch).toEqual({ experienceLevel: "advanced" });
    expect(result.suggestNextStep).toBe(true);
    expect(result.reformulationCount).toBe(0);
  });

  it("écarte silencieusement une extraction non conforme au schéma — jamais persistée", async () => {
    const provider = providerReturning({
      reply: "D'accord.",
      isReformulation: false,
      // `experienceLevel` doit être l'un des trois niveaux connus — "légendaire" est hors schéma.
      extraction: { experienceLevel: "légendaire" },
      suggestNextStep: true,
    });

    const result = await runOnboardingTurn(provider, baseRequest);

    expect(result.extractionPatch).toBeNull();
    // Une extraction rejetée requalifie le tour en reformulation, même si le fournisseur ne
    // l'avait pas signalé lui-même : jamais d'avancée silencieuse sur une donnée invalide.
    expect(result.isReformulation).toBe(true);
    expect(result.suggestNextStep).toBe(false);
    expect(result.reformulationCount).toBe(1);
  });

  it("écarte une extraction dont un champ imbriqué est invalide (sport sans code)", async () => {
    const provider = providerReturning({
      reply: "D'accord.",
      isReformulation: false,
      extraction: { sports: [{ level: "intermediate" }] }, // sportCode manquant
      suggestNextStep: true,
    });

    const result = await runOnboardingTurn(provider, { ...baseRequest, step: "sports" });

    expect(result.extractionPatch).toBeNull();
    expect(result.isReformulation).toBe(true);
  });

  it("respecte le drapeau de reformulation explicite du fournisseur, même sans extraction", async () => {
    const provider = providerReturning({
      reply: "Je n'ai pas compris, peux-tu préciser ?",
      isReformulation: true,
      extraction: null,
      suggestNextStep: false,
    });

    const result = await runOnboardingTurn(provider, baseRequest);

    expect(result.isReformulation).toBe(true);
    expect(result.extractionPatch).toBeNull();
    expect(result.reformulationCount).toBe(1);
  });

  it("remet le compteur de reformulations à zéro dès qu'un tour aboutit", async () => {
    const provider = providerReturning({
      reply: "Parfait.",
      isReformulation: false,
      extraction: { experienceLevel: "beginner" },
      suggestNextStep: true,
    });

    const result = await runOnboardingTurn(provider, { ...baseRequest, reformulationCount: 1 });

    expect(result.reformulationCount).toBe(0);
  });

  it("signale la limite de reformulations atteinte (repli question fermée, R6 du plan)", async () => {
    const provider = providerReturning({
      reply: "Toujours pas compris.",
      isReformulation: true,
      extraction: null,
      suggestNextStep: false,
    });

    const result = await runOnboardingTurn(provider, {
      ...baseRequest,
      reformulationCount: MAX_REFORMULATIONS_BEFORE_CLOSED_QUESTION - 1,
    });

    expect(result.reachedReformulationLimit).toBe(true);
  });
});
