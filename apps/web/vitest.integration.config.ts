import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests d'intégration (finding I13, `plans/US-01-...md` §4.3) — nécessitent une instance Supabase
 * locale démarrée (`supabase start`). Config séparée du `test` unitaire pour ne jamais les
 * exécuter par erreur sans base disponible (même schéma que `packages/db`).
 *
 * `resolve.conditions: ["react-server"]` : plusieurs modules serveur de `apps/web` importent le
 * paquet marqueur `server-only`, dont la condition d'export `default` lève une exception
 * inconditionnelle hors d'un bundle Next.js. On pose la même condition que Next.js pour tout code
 * strictement serveur (voir `packages/db/vitest.integration.config.ts`, même rationale).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
    conditions: ["react-server"],
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["test/integration/env.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
