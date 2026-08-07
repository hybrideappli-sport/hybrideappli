// Configuration ESLint racine — Turborepo / pnpm workspaces.
//
// `apps/web` a sa propre configuration (`apps/web/eslint.config.mjs`,
// basée sur `eslint-config-next`) et n'est PAS couvert par ce fichier.
//
// Ce fichier fait respecter les frontières entre packages définies par
// ADR-002 et ADR-003 :
//
//   apps/web     → domain, rules-engine, coach-llm, db
//   db           → domain
//   rules-engine → domain            (et RIEN d'autre)
//   coach-llm    → domain            (+ futur SDK LLM, Lot L3)
//   domain       → ∅
//
// `@hybride/rules-engine` doit rester un module pur : aucune dépendance
// réseau, base, ni framework (`next`, `@supabase/*`, `db`, `coach-llm`).
// `@hybride/coach-llm` ne doit jamais dépendre de `@hybride/rules-engine`
// (sens unique de la dépendance, ADR-002 §4) ni de `db`/`next`.

import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";
import globals from "globals";

// `import/no-restricted-paths` résout `target`/`from` par rapport à
// `basePath` (par défaut `process.cwd()`). Comme le lint de chaque package
// s'exécute avec `cwd` = ce package (`pnpm --filter <pkg> lint`), un
// `basePath` implicite rendrait la règle silencieusement inopérante (les
// chemins ne matcheraient jamais). On fixe donc `basePath` explicitement à
// la racine du monorepo, calculée depuis l'emplacement de ce fichier.
const monorepoRoot = import.meta.dirname;

const restrictedPathsRule = [
  "error",
  {
    basePath: monorepoRoot,
    zones: [
      {
        target: "./packages/rules-engine/src",
        from: ["./packages/db/src", "./packages/coach-llm/src", "./apps"],
        message:
          "@hybride/rules-engine doit rester pur : aucune dépendance vers db, coach-llm ou apps/web (ADR-002, ADR-003).",
      },
      {
        target: "./packages/coach-llm/src",
        from: ["./packages/rules-engine/src", "./packages/db/src", "./apps"],
        message:
          "@hybride/coach-llm ne dépend jamais de rules-engine (sens unique de la dépendance, ADR-002 §4) ni de db/apps.",
      },
      {
        target: "./packages/domain/src",
        from: [
          "./packages/rules-engine/src",
          "./packages/coach-llm/src",
          "./packages/db/src",
          "./apps",
        ],
        message: "@hybride/domain ne dépend d'aucun autre package (ADR-003).",
      },
    ],
  },
];

const noRestrictedExternalImports = [
  "error",
  {
    patterns: [
      {
        group: ["next", "next/*", "@supabase/*", "react", "react-dom", "stripe"],
        message:
          "@hybride/rules-engine est un module pur : 0 I/O, aucune dépendance réseau/base/framework (ADR-002, ADR-003).",
      },
    ],
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "apps/web/**",
      "**/*.config.mjs",
      "**/*.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      "import/no-restricted-paths": restrictedPathsRule,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["packages/rules-engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": noRestrictedExternalImports,
    },
  },
  {
    files: ["packages/coach-llm/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "@supabase/*"],
              message:
                "@hybride/coach-llm ne dépend jamais de next ni de @supabase/* (ADR-002, ADR-003).",
            },
          ],
        },
      ],
    },
  },
);
