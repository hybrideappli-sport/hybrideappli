import "server-only";

import { DeterministicMockLlmProvider, MistralLlmProvider, type LlmProvider } from "@hybride/coach-llm";

/**
 * Sélection du fournisseur LLM (`08-architecture.md` §9, table des environnements) :
 *
 * - `NODE_ENV=test` ⟹ TOUJOURS le mock déterministe, quelle que soit `MISTRAL_API_KEY` — aucun
 *   appel réseau ne doit jamais s'échapper dans la suite de tests automatisée.
 * - sinon, `MISTRAL_API_KEY` présente ⟹ adaptateur Mistral réel (dev, preview, production).
 * - sinon (clé absente) ⟹ repli mock déterministe, avec avertissement — jamais un crash au
 *   démarrage pour ce seul motif (l'onboarding reste utilisable en régime dégradé template/mock).
 *
 * Un seul point d'appel dans `apps/web` : les Route Handlers ne construisent jamais eux-mêmes un
 * `MistralLlmProvider` (ADR-002 §2, ADR-010 §4 « fournisseur abstrait derrière un port »).
 */
export function getLlmProvider(): LlmProvider {
  if (process.env.NODE_ENV === "test") {
    return new DeterministicMockLlmProvider();
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.warn("[coach-llm] MISTRAL_API_KEY absente — repli sur le mock déterministe (dégradé, hors production).");
    return new DeterministicMockLlmProvider();
  }

  return new MistralLlmProvider({ apiKey });
}
