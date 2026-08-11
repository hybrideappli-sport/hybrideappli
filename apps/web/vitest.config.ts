import path from "node:path";
import { defineConfig } from "vitest/config";

// `apps/web` n'a pas (encore) de tests unitaires Vitest propres (Lot L3) — seuls des tests
// d'intégration/E2E existent ici : `e2e/**` (Playwright, `playwright.config.ts`, exécuté via
// `pnpm test:e2e`, JAMAIS via `vitest`) et `test/integration/**` (`vitest.integration.config.ts`,
// finding I13 — nécessite une instance Supabase locale démarrée). Sans ces exclusions, Vitest
// ramasse `e2e/*.spec.ts` par défaut et tente d'exécuter les `test()` de `@playwright/test` avec
// son propre runner (échoue immédiatement : « Playwright Test did not expect test() to be called
// here »), et ramasserait les tests d'intégration sans base disponible dans tout CI qui ne lance
// que `pnpm test`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**", "test/integration/**"],
  },
});
