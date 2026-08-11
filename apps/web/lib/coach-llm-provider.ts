import "server-only";

import { DeterministicMockLlmProvider, MistralLlmProvider, type LlmProvider } from "@hybride/coach-llm";

/**
 * Sélection du fournisseur LLM (`08-architecture.md` §9, table des environnements) :
 *
 * - `NODE_ENV=test` ⟹ TOUJOURS le mock déterministe, quelle que soit `MISTRAL_API_KEY` — aucun
 *   appel réseau ne doit jamais s'échapper dans la suite de tests automatisée (unitaire/intégration).
 * - `COACH_LLM_PROVIDER=mock` ⟹ idem, explicitement. Nécessaire en PLUS de `NODE_ENV=test` : Next.js
 *   impose lui-même `NODE_ENV` (`development`/`production`) au serveur qu'il démarre — un serveur
 *   `next dev`/`next start` lancé pour les tests E2E Playwright (`apps/web/e2e/`) ne peut donc
 *   jamais valoir `NODE_ENV=test`. C'est cette variable, positionnée par
 *   `apps/web/playwright.config.ts`, qui garantit qu'aucun test E2E ne dépend du réseau ni d'un
 *   quota Mistral, et que leurs scénarios restent déterministes (script du mock, voir
 *   `mock-provider.ts`).
 * - sinon, `MISTRAL_API_KEY` présente ⟹ adaptateur Mistral réel (dev manuel, preview, production).
 * - sinon (clé absente), `NODE_ENV !== 'production'` ⟹ repli mock déterministe, avec avertissement
 *   bruyant — jamais un crash au démarrage pour ce seul motif (l'onboarding reste utilisable en
 *   régime dégradé template/mock hors production).
 * - sinon (clé absente EN PRODUCTION) ⟹ REFUS EXPLICITE. Correction post-revue (finding I12) :
 *   avant cette correction, une absence de clé en production servait silencieusement des réponses
 *   SCRIPTÉES (le mock déterministe) comme conversation de coaching réelle et comme explications
 *   des décisions du moteur — jamais annoncé à l'utilisateur, jamais journalisé distinctement d'un
 *   repli de développement. Même principe fail-closed que `verifyAndParseEvent()`
 *   (`apps/web/app/api/v1/webhooks/stripe/route.ts`) pour `STRIPE_WEBHOOK_SECRET` absente en
 *   production : un secret/une clé manquante EN PRODUCTION est une erreur de configuration, jamais
 *   un motif de dégradation silencieuse.
 *
 * Un seul point d'appel dans `apps/web` : les Route Handlers ne construisent jamais eux-mêmes un
 * `MistralLlmProvider` (ADR-002 §2, ADR-010 §4 « fournisseur abstrait derrière un port »).
 */
export class MissingLlmProviderConfigurationError extends Error {}

export function getLlmProvider(): LlmProvider {
  if (process.env.NODE_ENV === "test" || process.env.COACH_LLM_PROVIDER === "mock") {
    return new DeterministicMockLlmProvider();
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[coach-llm] MISTRAL_API_KEY absente EN PRODUCTION — refus explicite (fail closed). " +
          "Aucune conversation d'onboarding ni explication n'est générée tant que cette clé n'est pas configurée " +
          "(voir en-tête de ce fichier) : jamais de repli silencieux sur des réponses scriptées en production.",
      );
      throw new MissingLlmProviderConfigurationError(
        "getLlmProvider: MISTRAL_API_KEY absente en production — configuration incomplète.",
      );
    }
    console.warn("[coach-llm] MISTRAL_API_KEY absente — repli sur le mock déterministe (dégradé, hors production).");
    return new DeterministicMockLlmProvider();
  }

  return new MistralLlmProvider({ apiKey });
}
