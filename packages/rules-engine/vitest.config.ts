import { defineConfig } from "vitest/config";

// `@hybride/rules-engine` porte le risque de blessure du produit : couverture
// minimale 90 % imposée par `plans/US-01-coach-ia-personnalise.md` §4.4.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
