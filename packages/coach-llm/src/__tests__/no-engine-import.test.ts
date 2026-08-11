/**
 * Test de frontière (ADR-002 §4) : `@hybride/coach-llm` n'importe JAMAIS
 * `@hybride/rules-engine` — sens unique de la dépendance, le LLM ne peut donc jamais, même
 * indirectement, déclencher un recalcul ou modifier un plan. Complète la règle ESLint
 * `import/no-restricted-paths` (racine du monorepo) par une vérification exécutable, indépendante
 * de la configuration du linter.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(import.meta.dirname, "..");
const THIS_FILE = path.resolve(import.meta.dirname, "no-engine-import.test.ts");

// Motifs resserrés sur des IMPORTS/require réels — pas sur une simple mention textuelle. Les
// docstrings du package expliquent légitimement la frontière ADR-002 en nommant
// "@hybride/rules-engine" en prose (voir `llm-provider.ts`, `index.ts`) : ce n'est pas un import.
const FORBIDDEN_PATTERNS = [
  /from\s+["'][^"']*rules-engine[^"']*["']/,
  /require\(\s*["'][^"']*rules-engine[^"']*["']\s*\)/,
];

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && fullPath !== THIS_FILE) {
      // `THIS_FILE` exclu : il contient nécessairement les motifs ci-dessus dans leur propre
      // définition et dans ses assertions, ce qui n'est ni un import ni une violation.
      files.push(fullPath);
    }
  }
  return files;
}

describe("frontière ADR-002 §4 — coach-llm ne dépend jamais de rules-engine", () => {
  const files = listSourceFiles(SRC_ROOT);

  it("a bien trouvé des fichiers source à analyser (le test n'est pas vide)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.relative(SRC_ROOT, file), file] as const))(
    "%s n'importe pas @hybride/rules-engine",
    (_relative, file) => {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `${file} référence rules-engine (motif ${pattern})`).toBe(false);
      }
    },
  );

  it("package.json ne déclare aucune dépendance vers @hybride/rules-engine", () => {
    const pkg = JSON.parse(readFileSync(path.resolve(SRC_ROOT, "..", "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@hybride/rules-engine"]).toBeUndefined();
    expect(pkg.devDependencies?.["@hybride/rules-engine"]).toBeUndefined();
  });
});
