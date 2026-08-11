/**
 * Test de non-régression — finding I12 (contre-revue post-correction) : l'échappatoire mock
 * (`NODE_ENV=test` ou `COACH_LLM_PROVIDER=mock`) ne doit JAMAIS pouvoir contourner le fail-closed
 * de production. Avant correction, la condition mock était évaluée AVANT le garde
 * `NODE_ENV=production`, donc une variable `COACH_LLM_PROVIDER=mock` mal positionnée en production
 * servait silencieusement des réponses scriptées comme du vrai coaching. Ce test fait tourner le
 * module dans un environnement `NODE_ENV=production` simulé (`vi.stubEnv`, restauré à chaque test)
 * et vérifie que seule la présence de `MISTRAL_API_KEY` détermine le comportement en production,
 * quelle que soit `COACH_LLM_PROVIDER`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Les deux modules sont ré-importés ENSEMBLE après `vi.resetModules()` pour partager le même
// registre de modules : importer `@hybride/coach-llm` statiquement en tête de fichier produirait
// des classes d'un registre différent de celles construites par `./coach-llm-provider` une fois
// rechargé, et `toBeInstanceOf` échouerait alors à tort (identité de classe différente).
async function loadProvider() {
  vi.resetModules();
  const [provider, coachLlm] = await Promise.all([import("./coach-llm-provider"), import("@hybride/coach-llm")]);
  return { ...provider, ...coachLlm };
}

describe("getLlmProvider — sélection du fournisseur LLM (I12)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuse explicitement en production sans MISTRAL_API_KEY, même avec COACH_LLM_PROVIDER=mock", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COACH_LLM_PROVIDER", "mock");
    vi.stubEnv("MISTRAL_API_KEY", "");

    const { getLlmProvider, MissingLlmProviderConfigurationError } = await loadProvider();

    expect(() => getLlmProvider()).toThrow(MissingLlmProviderConfigurationError);
  });

  it("refuse explicitement en production sans MISTRAL_API_KEY et sans COACH_LLM_PROVIDER positionnée", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COACH_LLM_PROVIDER", "");
    vi.stubEnv("MISTRAL_API_KEY", "");

    const { getLlmProvider, MissingLlmProviderConfigurationError } = await loadProvider();

    expect(() => getLlmProvider()).toThrow(MissingLlmProviderConfigurationError);
  });

  it("utilise l'adaptateur Mistral réel en production quand MISTRAL_API_KEY est présente, même avec COACH_LLM_PROVIDER=mock résiduelle", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COACH_LLM_PROVIDER", "mock");
    vi.stubEnv("MISTRAL_API_KEY", "sk-fake-key-for-test");

    const { getLlmProvider, MistralLlmProvider } = await loadProvider();

    expect(getLlmProvider()).toBeInstanceOf(MistralLlmProvider);
  });

  it("utilise le mock déterministe hors production quand NODE_ENV=test", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("COACH_LLM_PROVIDER", "");
    vi.stubEnv("MISTRAL_API_KEY", "");

    const { getLlmProvider, DeterministicMockLlmProvider } = await loadProvider();

    expect(getLlmProvider()).toBeInstanceOf(DeterministicMockLlmProvider);
  });

  it("utilise le mock déterministe hors production quand COACH_LLM_PROVIDER=mock est positionnée explicitement", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COACH_LLM_PROVIDER", "mock");
    vi.stubEnv("MISTRAL_API_KEY", "sk-fake-key-for-test");

    const { getLlmProvider, DeterministicMockLlmProvider } = await loadProvider();

    expect(getLlmProvider()).toBeInstanceOf(DeterministicMockLlmProvider);
  });

  it("replie sur le mock déterministe hors production sans crash quand MISTRAL_API_KEY est absente", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COACH_LLM_PROVIDER", "");
    vi.stubEnv("MISTRAL_API_KEY", "");

    const { getLlmProvider, DeterministicMockLlmProvider } = await loadProvider();

    expect(getLlmProvider()).toBeInstanceOf(DeterministicMockLlmProvider);
  });
});
