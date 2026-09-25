import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Code tiers minifié, copié depuis `node_modules` par `scripts/copy-maplibre-worker.mjs` à
    // chaque `dev`/`build` (ADR-018, lot L1) : ni écrit ni modifiable ici, et le linter y produit
    // des centaines de faux positifs sur une seule ligne minifiée.
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
