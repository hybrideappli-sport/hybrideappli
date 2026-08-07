import { defineConfig } from "vitest/config";

// Config par défaut (`pnpm test`) : tests UNITAIRES uniquement (repositories,
// mapping, etc. — aucun pour l'instant, Lot L1). Exclut explicitement les
// tests d'intégration RLS/immuabilité (`vitest.integration.config.ts`), qui
// nécessitent une instance Supabase locale démarrée et ne doivent jamais
// être ramassés silencieusement par la commande générique `test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/__tests__/integration/**"],
    environment: "node",
  },
});
