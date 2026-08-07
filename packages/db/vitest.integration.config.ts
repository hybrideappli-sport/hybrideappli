import { defineConfig } from "vitest/config";

// Tests d'intégration RLS / immuabilité — nécessitent une instance Supabase
// locale démarrée (`supabase start`, voir `08-architecture.md` §9 : environnement
// « Local »). Config séparée du `test` unitaire pour ne jamais les exécuter par
// erreur sans base disponible (Turborepo ne met pas ces tests en cache : voir
// script racine `test:integration`).
export default defineConfig({
  test: {
    include: ["src/__tests__/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["src/__tests__/integration/env.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
