import "server-only";

import { DeterministicMockLlmProvider, MistralLlmProvider, type LlmProvider } from "@hybride/coach-llm";

/**
 * Sélection du fournisseur LLM (`08-architecture.md` §9, table des environnements) :
 *
 * - `NODE_ENV=production` ⟹ le garde de production est évalué EN PREMIER, avant toute échappatoire
 *   mock. `MISTRAL_API_KEY` présente ⟹ adaptateur Mistral réel. `MISTRAL_API_KEY` absente ⟹ REFUS
 *   EXPLICITE (voir plus bas), **quelle que soit la valeur de `COACH_LLM_PROVIDER`**. Correction
 *   post-contre-revue (finding I12) : la version précédente évaluait l'échappatoire
 *   `COACH_LLM_PROVIDER=mock` AVANT ce garde — une variable d'environnement mal positionnée en
 *   production (reliquat de config preview, erreur humaine) suffisait alors à servir des réponses
 *   SCRIPTÉES (le mock déterministe) comme conversation de coaching réelle et comme explications
 *   des décisions du moteur, sans erreur ni log distinctif. En production, le mode mock explicite
 *   n'est donc plus jamais atteignable : seul un `NODE_ENV` différent de `production` peut l'activer.
 * - sinon (hors production), `NODE_ENV=test` ⟹ TOUJOURS le mock déterministe, quelle que soit
 *   `MISTRAL_API_KEY` — aucun appel réseau ne doit jamais s'échapper dans la suite de tests
 *   automatisée (unitaire/intégration).
 * - sinon (hors production), `COACH_LLM_PROVIDER=mock` ⟹ idem, explicitement. Nécessaire en PLUS de
 *   `NODE_ENV=test` : Next.js impose lui-même `NODE_ENV` (`development`/`production`) au serveur
 *   qu'il démarre — un serveur `next dev`/`next start` lancé pour les tests E2E Playwright
 *   (`apps/web/e2e/`) ne peut donc jamais valoir `NODE_ENV=test`. C'est cette variable, positionnée
 *   par `apps/web/playwright.config.ts`, qui garantit qu'aucun test E2E ne dépend du réseau ni d'un
 *   quota Mistral, et que leurs scénarios restent déterministes (script du mock, voir
 *   `mock-provider.ts`).
 * - sinon, `MISTRAL_API_KEY` présente ⟹ adaptateur Mistral réel (dev manuel, preview).
 * - sinon (clé absente, hors production) ⟹ repli mock déterministe, avec avertissement bruyant —
 *   jamais un crash au démarrage pour ce seul motif (l'onboarding reste utilisable en régime dégradé
 *   template/mock hors production).
 *
 * Même principe fail-closed que `verifyAndParseEvent()`
 * (`apps/web/app/api/v1/webhooks/stripe/route.ts`) pour `STRIPE_WEBHOOK_SECRET` absente en
 * production : un secret/une clé manquante EN PRODUCTION est une erreur de configuration, jamais un
 * motif de dégradation silencieuse.
 *
 * Un seul point d'appel dans `apps/web` : les Route Handlers ne construisent jamais eux-mêmes un
 * `MistralLlmProvider` (ADR-002 §2, ADR-010 §4 « fournisseur abstrait derrière un port »).
 */
export class MissingLlmProviderConfigurationError extends Error {}

export function getLlmProvider(): LlmProvider {
  if (process.env.NODE_ENV === "production") {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      console.error(
        "[coach-llm] MISTRAL_API_KEY absente EN PRODUCTION — refus explicite (fail closed). " +
          "Aucune conversation d'onboarding ni explication n'est générée tant que cette clé n'est pas configurée " +
          "(voir en-tête de ce fichier) : jamais de repli silencieux sur des réponses scriptées en production, " +
          "même si COACH_LLM_PROVIDER=mock est positionnée par erreur.",
      );
      throw new MissingLlmProviderConfigurationError(
        "getLlmProvider: MISTRAL_API_KEY absente en production — configuration incomplète.",
      );
    }
    return new MistralLlmProvider({ apiKey });
  }

  if (process.env.NODE_ENV === "test" || process.env.COACH_LLM_PROVIDER === "mock") {
    return new DeterministicMockLlmProvider();
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.warn("[coach-llm] MISTRAL_API_KEY absente — repli sur le mock déterministe (dégradé, hors production).");
    return new DeterministicMockLlmProvider();
  }

  return new MistralLlmProvider({ apiKey });
}
