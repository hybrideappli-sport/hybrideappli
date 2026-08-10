import { defineConfig } from "vitest/config";

// `apps/web` n'a pas (encore) de tests unitaires Vitest propres (Lot L3) — seuls des tests
// d'intégration/E2E existent ici : `e2e/**` (Playwright, `playwright.config.ts`, exécuté via
// `pnpm test:e2e`, JAMAIS via `vitest`). Sans cette exclusion, Vitest ramasse `e2e/*.spec.ts` par
// défaut et tente d'exécuter les `test()` de `@playwright/test` avec son propre runner, qui
// échoue immédiatement (« Playwright Test did not expect test() to be called here »).
export default defineConfig({
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
  },
});
