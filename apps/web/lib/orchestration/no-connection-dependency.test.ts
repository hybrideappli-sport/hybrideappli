/**
 * `08-architecture.md` §13.1 (AC9) — l'US-02 est une couche d'ENRICHISSEMENT : `buildPlanningContext()`
 * lit du réalisé (`session_logs`, `body_metrics`), jamais une connexion ; `generatePlan()` ne reçoit
 * jamais de score hybride ; l'absence totale de source connectée produit exactement le comportement
 * F1. Aucun module d'orchestration (`apps/web/lib/orchestration/**`) ni du moteur
 * (`packages/rules-engine/src/**`) ne référence donc `data_connections`, `sync_runs` ou
 * `hybrid_scores`.
 *
 * Fichier manquant relevé par le second audit `code-reviewer` (finding B5, revue post-`aaba499`),
 * cité par son nom exact dès `08-architecture.md` : « Un test d'architecture
 * (`no-connection-dependency.test.ts`) fige cet invariant, sur le modèle du test de frontière
 * `coach-llm` ↛ `rules-engine` d'ADR-003 » (voir `packages/coach-llm/src/__tests__/no-engine-import.test.ts`).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ORCHESTRATION_ROOT = path.resolve(import.meta.dirname);
const RULES_ENGINE_SRC_ROOT = path.resolve(import.meta.dirname, "../../../../packages/rules-engine/src");
const THIS_FILE = path.resolve(import.meta.dirname, "no-connection-dependency.test.ts");

const FORBIDDEN_PATTERNS = [/\bdata_connections\b/, /\bsync_runs\b/, /\bhybrid_scores\b/];

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".d.ts") &&
      !entry.includes(".test.") &&
      !entry.includes(".property.test.") &&
      fullPath !== THIS_FILE
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("no-connection-dependency — AC9 (F1 ↛ F2)", () => {
  const orchestrationFiles = listSourceFiles(ORCHESTRATION_ROOT);
  const rulesEngineFiles = listSourceFiles(RULES_ENGINE_SRC_ROOT);
  const files = [...orchestrationFiles, ...rulesEngineFiles];

  it("a bien trouvé des fichiers source à analyser dans les deux périmètres", () => {
    expect(orchestrationFiles.length).toBeGreaterThan(0);
    expect(rulesEngineFiles.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.relative(path.resolve(import.meta.dirname, "../../.."), file), file] as const))(
    "%s ne référence ni data_connections, ni sync_runs, ni hybrid_scores",
    (_relative, file) => {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `${file} référence une table F2 (motif ${pattern})`).toBe(false);
      }
    },
  );
});
