/**
 * ADR-014 §6 — `computeHybridScore()` est HORS PIPELINE : aucune étape de `generatePlan()`
 * (`generate-plan.ts`, `pipeline/**`) ne l'appelle, et le score hybride ne conditionne donc jamais
 * une décision du moteur. Annoncé en en-tête de `hybrid-score/compute-hybrid-score.ts`
 * ("Voir `hybrid-score-not-in-pipeline.test.ts`") — ce fichier était manquant (finding B5, revue
 * post-`aaba499`). Test de frontière, sur le modèle de `no-engine-import.test.ts`
 * (`@hybride/coach-llm`) et de `no-connection-dependency.test.ts` (US-02).
 *
 * Durcissement (finding N7, seconde passe `code-reviewer`) : `packages/rules-engine/src/index.ts`
 * réexporte `computeHybridScore` — un import via ce barrel (`../index`, ou tout autre chemin qui le
 * traverse) échappait entièrement au scan d'imports ci-dessous (motifs resserrés sur des chemins
 * contenant littéralement `hybrid-score`), alors qu'il viole exactement le même invariant. On
 * ajoute donc un scan d'APPEL direct (`computeHybridScore(`), insensible au chemin d'import
 * emprunté, en plus du scan d'imports (qui reste utile : il attrape un import inutilisé, avant même
 * tout appel). Les deux scans s'appliquent au contenu DÉPOUILLÉ de ses commentaires : sans ce
 * dépouillement, la docstring de ce fichier même (qui mentionne `computeHybridScore` en prose)
 * produirait un faux positif si elle était un jour incluse dans le périmètre scanné.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(import.meta.dirname, "..");
// Le pipeline au sens strict (ADR-014 §6) : `generate-plan.ts` (l'orchestrateur) et chaque étape
// numérotée de `pipeline/**`. `hybrid-score/**` est exclu par construction : c'est la fonction
// elle-même, l'invariant porte sur qui l'APPELLE, pas sur son propre code.

// Motifs resserrés sur des IMPORTS/require réels — pas sur une simple mention textuelle (même
// restriction que `packages/coach-llm/src/__tests__/no-engine-import.test.ts`).
const FORBIDDEN_PATTERNS = [/from\s+["'][^"']*hybrid-score[^"']*["']/, /require\(\s*["'][^"']*hybrid-score[^"']*["']\s*\)/];
// Attrape l'appel quel que soit le chemin d'import emprunté (y compris via le barrel `index.ts`,
// finding N7) : peu importe D'OÙ `computeHybridScore` a été importé, ce qui compte est qu'aucune
// étape de pipeline ne l'INVOQUE.
const FORBIDDEN_CALL_PATTERN = /\bcomputeHybridScore\s*\(/;

/** Dépouille les commentaires de bloc et de ligne — évite tout faux positif sur de la prose. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
}

function listPipelineFiles(): string[] {
  const files: string[] = [];
  // `generate-plan.ts` lui-même, pas récursif sur tout `src` (qui contiendrait `hybrid-score/**`,
  // `placement/**`, `__tests__/**` — hors de portée de cet invariant précis).
  files.push(path.join(SRC_ROOT, "generate-plan.ts"));
  const pipelineDir = path.join(SRC_ROOT, "pipeline");
  for (const entry of readdirSync(pipelineDir)) {
    const fullPath = path.join(pipelineDir, entry);
    if (statSync(fullPath).isFile() && entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("hybrid-score-not-in-pipeline — ADR-014 §6", () => {
  const files = listPipelineFiles();

  it("a bien trouvé des fichiers de pipeline à analyser (le test n'est pas vide)", () => {
    expect(files.length).toBeGreaterThan(1);
  });

  it.each(files.map((file) => [path.relative(SRC_ROOT, file), file] as const))(
    "%s n'importe ni n'appelle computeHybridScore, quel que soit le chemin d'import",
    (_relative, file) => {
      const content = stripComments(readFileSync(file, "utf-8"));
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `${file} référence le score hybride (motif ${pattern})`).toBe(false);
      }
      expect(
        FORBIDDEN_CALL_PATTERN.test(content),
        `${file} appelle computeHybridScore() directement — quel que soit son chemin d'import (finding N7)`,
      ).toBe(false);
    },
  );
});
