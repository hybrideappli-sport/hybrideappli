/**
 * Valeurs permises du débrief (ADR-019 §5) : le prompt ÉNUMÈRE, `runDebriefTurn()` VÉRIFIE.
 *
 * `sessionType` est une énumération du domaine, `sportCode` un référentiel en base. Le second
 * n'est vérifiable ni par le schéma ni par le prompt seul : c'est l'orchestration qui le confronte
 * au référentiel transmis. Terrain exact de l'incident `course_a_pied` du 2026-09-18.
 */

import { describe, expect, it } from "vitest";

import { SESSION_TYPES } from "@hybride/domain";

import { runDebriefTurn } from "../debrief-conversation";
import type { ConversationTurnOutput, DebriefTurnInput, LlmProvider } from "../llm-provider";
import { DEBRIEF_SYSTEM_PROMPT } from "../mistral-provider";

const REFERENTIAL = [
  { code: "running", labelFr: "Course à pied" },
  { code: "cycling", labelFr: "Vélo" },
];

function stubProvider(extraction: Record<string, unknown>): LlmProvider & { lastInput?: DebriefTurnInput } {
  const provider: LlmProvider & { lastInput?: DebriefTurnInput } = {
    name: "stub",
    converseOnboarding: () => Promise.reject(new Error("hors sujet")),
    renderExplanation: () => Promise.reject(new Error("hors sujet")),
    converseDebrief(input: DebriefTurnInput): Promise<ConversationTurnOutput> {
      provider.lastInput = input;
      return Promise.resolve({ reply: "Noté.", isReformulation: false, extraction, suggestNextStep: false });
    },
  };
  return provider;
}

const offPlan = { sessionType: "cross_training", durationMin: null, sportLabel: null, isOffPlan: true };

function turn(provider: LlmProvider, sportReferential = REFERENTIAL) {
  return runDebriefTurn(provider, {
    history: [],
    draft: {},
    userMessage: "J'ai fait une heure de course à pied",
    session: offPlan,
    reformulationCount: 0,
    sportReferential,
  });
}

describe("débrief — valeurs permises de sessionType et sportCode", () => {
  it("le prompt énumère chaque type de séance du domaine", () => {
    for (const type of SESSION_TYPES) expect(DEBRIEF_SYSTEM_PROMPT).toContain(type);
  });

  it("le référentiel sports est transmis au fournisseur", async () => {
    const provider = stubProvider({ completion: "done" });
    await turn(provider);
    expect(provider.lastInput?.sportReferential).toEqual(REFERENTIAL);
  });

  it("un sportCode du référentiel est accepté", async () => {
    const result = await turn(stubProvider({ completion: "done", sportCode: "running", actualDurationMin: 60 }));
    expect(result.extractionPatch).toEqual({ completion: "done", sportCode: "running", actualDurationMin: 60 });
    expect(result.draft.sportCode).toBe("running");
  });

  it("un sportCode inventé rejette le patch entier et requalifie le tour", async () => {
    const result = await turn(stubProvider({ completion: "done", sportCode: "course_a_pied" }));
    expect(result.extractionPatch).toBeNull();
    expect(result.draft).toEqual({});
    expect(result.isReformulation).toBe(true);
  });

  it("sans référentiel, aucun sportCode n'est accepté", async () => {
    const result = await turn(stubProvider({ sportCode: "running" }), []);
    expect(result.extractionPatch).toBeNull();
  });

  it("un sessionType hors énumération rejette le patch", async () => {
    const result = await turn(stubProvider({ completion: "done", sessionType: "footing" }));
    expect(result.extractionPatch).toBeNull();
  });
});
