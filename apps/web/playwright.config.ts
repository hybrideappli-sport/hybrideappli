import { defineConfig, devices } from "@playwright/test";

// Playwright charge ce fichier de config en CJS (`apps/web/package.json` n'a pas `"type":
// "module"`) : `import.meta.dirname` n'y est pas disponible, contrairement au reste du monorepo
// (packages ESM purs). `__dirname` fonctionne ici sans configuration supplémentaire.
declare const __dirname: string;

/**
 * Tests E2E de l'onboarding (Lot L3, plan §4.4) — `apps/web/e2e/`.
 *
 * Nécessite Supabase local démarré (`supabase start`, `supabase db reset` pour un référentiel
 * propre — rulesets/consent_documents activés par `supabase/seed.sql`). `COACH_LLM_PROVIDER=mock`
 * force le mock déterministe : ZÉRO appel réseau réel vers Mistral pendant ces tests (voir
 * `apps/web/lib/coach-llm-provider.ts`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3300",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev -p 3300",
    url: "http://localhost:3300",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    cwd: __dirname,
    env: {
      COACH_LLM_PROVIDER: "mock",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
