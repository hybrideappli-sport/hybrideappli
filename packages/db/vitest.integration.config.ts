import { defineConfig } from "vitest/config";

// Tests d'intégration RLS / immuabilité — nécessitent une instance Supabase
// locale démarrée (`supabase start`, voir `08-architecture.md` §9 : environnement
// « Local »). Config séparée du `test` unitaire pour ne jamais les exécuter par
// erreur sans base disponible (Turborepo ne met pas ces tests en cache : voir
// script racine `test:integration`).
export default defineConfig({
  // `resolve.conditions: ["react-server"]` : `./client/service-role.ts` importe le paquet marqueur
  // `server-only` (finding I6, audit Lot L1). Sa condition d'export `default` lève une exception
  // inconditionnelle (elle suppose un bundle navigateur si la condition `react-server` n'est pas
  // posée par l'outil de build) ; Next.js pose cette condition pour tout code exécuté côté
  // Server Component / route serveur. Ces tests d'intégration exécutent ce module dans un
  // contexte strictement serveur (jamais un bundle client) : on pose la même condition ici pour
  // obtenir le même comportement (module vide, no-op) qu'en environnement Next.js réel.
  resolve: {
    conditions: ["react-server"],
  },
  test: {
    include: ["src/__tests__/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["src/__tests__/integration/env.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
