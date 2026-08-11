/**
 * `DeterministicMockLlmProvider` — comportement déterministe attendu par les tests d'intégration
 * et E2E du Lot L3 (`onboarding-complete.test.ts`, `onboarding.spec.ts`,
 * `onboarding-misunderstood.spec.ts`). Aucun appel réseau (vérifié implicitement : ce test
 * s'exécute sans jamais mocker `fetch`, et passe).
 */

import { describe, expect, it } from "vitest";

import { DeterministicMockLlmProvider } from "../mock-provider";
import { ProfileDraftPatchSchema } from "@hybride/domain";

describe("DeterministicMockLlmProvider — conversation d'onboarding", () => {
  const provider = new DeterministicMockLlmProvider();

  it("est déterministe : même entrée, même sortie", async () => {
    const input = { step: "goal", history: [], profileDraft: {}, userMessage: "Courir un marathon" };
    const first = await provider.converseOnboarding(input);
    const second = await provider.converseOnboarding(input);
    expect(first).toEqual(second);
  });

  it("extrait un objectif valide au regard de ProfileDraftPatchSchema", async () => {
    const output = await provider.converseOnboarding({
      step: "goal",
      history: [],
      profileDraft: {},
      userMessage: "Courir un marathon avant le 2027-04-15",
    });

    expect(output.extraction).not.toBeNull();
    const parsed = ProfileDraftPatchSchema.safeParse(output.extraction);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
    expect(output.suggestNextStep).toBe(true);
  });

  it("déclenche une reformulation sur un niveau hors vocabulaire fermé", async () => {
    const output = await provider.converseOnboarding({
      step: "level",
      history: [],
      profileDraft: {},
      userMessage: "je ne sais pas trop, un peu de tout",
    });

    expect(output.isReformulation).toBe(true);
    expect(output.extraction).toBeNull();
    expect(output.suggestNextStep).toBe(false);
  });

  it("reconnaît les trois niveaux du vocabulaire fermé", async () => {
    for (const [message, expected] of [
      ["débutant", "beginner"],
      ["intermédiaire", "intermediate"],
      ["avancé", "advanced"],
    ] as const) {
      const output = await provider.converseOnboarding({ step: "level", history: [], profileDraft: {}, userMessage: message });
      expect(output.extraction).toEqual({ experienceLevel: expected });
    }
  });

  it("extrait plusieurs sports séparés par une virgule", async () => {
    const output = await provider.converseOnboarding({
      step: "sports",
      history: [],
      profileDraft: { experienceLevel: "intermediate" },
      userMessage: "Course à pied, Musculation",
    });

    const parsed = ProfileDraftPatchSchema.safeParse(output.extraction);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sports).toHaveLength(2);
      expect(parsed.data.sports?.[0]?.isPrimary).toBe(true);
    }
  });

  it("demande une reformulation si aucun sport n'est identifié", async () => {
    const output = await provider.converseOnboarding({
      step: "sports",
      history: [],
      profileDraft: {},
      userMessage: "   ",
    });
    expect(output.isReformulation).toBe(true);
  });

  it("renderExplanation produit un texte toujours fondé sur les traces fournies", async () => {
    const output = await provider.renderExplanation({
      subjectType: "planned_session",
      correlationId: "corr-1",
      traces: [
        {
          ruleId: "progression.weekly_load",
          category: "progression",
          conditionExpr: "week over week",
          inputs: [{ field: "cap_pct", value: 10 }],
          output: { field: "target_load_units", before: 300, after: 330, direction: "increase" },
        },
      ],
    });

    expect(output.shortText).toContain("330");
    expect(output.shortText).toContain("300");
  });
});
