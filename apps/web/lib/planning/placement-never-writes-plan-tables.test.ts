/**
 * `08-architecture.md` §14.1 — F3 ↛ moteur : aucun module de `lib/planning/**` n'importe
 * `materializePlanVersion` (`lib/orchestration/materialize-plan-version.ts`) ni `regeneratePlan`
 * (`lib/orchestration/regenerate-plan.ts`). Le placement (F3) ne matérialise et ne régénère jamais
 * de plan lui-même — il ne fait QUE lire `(planned_sessions, availability_slots,
 * schedule_incidents, ruleset.params.planning)` et écrire `session_placements`/`schedule_incidents`
 * (ADR-016 §2).
 *
 * Fichier manquant relevé par le second audit `code-reviewer` (finding B5, revue post-`aaba499`) :
 * « ce sont précisément les deux frontières que le projet a désignées comme non négociables (F1 ↛
 * F2, F3 ↛ moteur), et `placement-never-changes-content.property.test.ts` — qui existe — [...] ne
 * couvre pas [cet] invariant » (l'absence d'écriture en base, par opposition à la stabilité du
 * contenu en sortie d'algorithme). Test de frontière, sur le modèle de
 * `packages/coach-llm/src/__tests__/no-engine-import.test.ts`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PLANNING_ROOT = path.resolve(import.meta.dirname);
const THIS_FILE = path.resolve(import.meta.dirname, "placement-never-writes-plan-tables.test.ts");

// Motifs resserrés sur des IMPORTS/require réels — pas sur une simple mention textuelle. Les
// docstrings de ce dossier expliquent légitimement la frontière F3 ↛ moteur en nommant
// `materializePlanVersion()`/`regeneratePlan()` en prose (`materialize-session-placements.ts`,
// `place-plan-version.ts`, `close-out-schedule-incidents.ts`) : ce n'est pas un import. Même
// restriction que `packages/coach-llm/src/__tests__/no-engine-import.test.ts`.
const FORBIDDEN_PATTERNS = [
  /from\s+["'][^"']*materialize-plan-version[^"']*["']/,
  /from\s+["'][^"']*regenerate-plan[^"']*["']/,
  /require\(\s*["'][^"']*materialize-plan-version[^"']*["']\s*\)/,
  /require\(\s*["'][^"']*regenerate-plan[^"']*["']\s*\)/,
];

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".d.ts") && !entry.includes(".test.") && fullPath !== THIS_FILE) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("placement-never-writes-plan-tables — F3 ↛ moteur (ADR-016 §2)", () => {
  const files = listSourceFiles(PLANNING_ROOT);

  it("a bien trouvé des fichiers source à analyser (le test n'est pas vide)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.relative(PLANNING_ROOT, file), file] as const))(
    "%s n'importe ni materializePlanVersion ni regeneratePlan",
    (_relative, file) => {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content), `${file} référence l'écriture de plan (motif ${pattern})`).toBe(false);
      }
    },
  );
});
