import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests unitaires Vitest de `apps/web` (ex: `lib/coach-llm-provider.test.ts`, finding I12), séparés
// des tests d'intégration/E2E qui vivent ailleurs : `e2e/**` (Playwright, `playwright.config.ts`,
// exécuté via `pnpm test:e2e`, JAMAIS via `vitest`) et `test/integration/**`
// (`vitest.integration.config.ts`, finding I13 — nécessite une instance Supabase locale démarrée).
// Sans ces exclusions, Vitest ramasse `e2e/*.spec.ts` par défaut et tente d'exécuter les `test()` de
// `@playwright/test` avec son propre runner (échoue immédiatement : « Playwright Test did not expect
// test() to be called here »), et ramasserait les tests d'intégration sans base disponible dans tout
// CI qui ne lance que `pnpm test`.
//
// `resolve.conditions: ["react-server"]` : plusieurs modules serveur de `apps/web` importent le
// paquet marqueur `server-only`, dont la condition d'export `default` lève une exception
// inconditionnelle hors d'un bundle Next.js. On pose la même condition que Next.js pour tout code
// strictement serveur (voir `vitest.integration.config.ts` et `packages/db/vitest.integration.config.ts`,
// même rationale).
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
    conditions: ["react-server"],
  },
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**", "test/integration/**"],
  },
});
