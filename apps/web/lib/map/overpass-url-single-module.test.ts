/**
 * ADR-018 §3 : « L'URL du serveur Overpass vit dans un seul module,
 * `apps/web/lib/map/overpass-client.ts`, marqué `import "server-only"`. La règle est vérifiable
 * par `grep`, exactement comme le chemin d'écriture unique d'ADR-004 §2 et de l'ADR-016 §2 ». Même
 * patron que `no-connection-dependency.test.ts` / `no-engine-import.test.ts`.
 *
 * Critère d'acceptation L2 n°3 : « aucun module client n'atteint l'URL Overpass ». Ce test le
 * garantit pour TOUT `apps/web` (client ET serveur) : l'URL n'existe qu'à un seul endroit, donc
 * elle ne peut structurellement pas être atteinte par `components/map/**` (client, `ssr: false`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.resolve(import.meta.dirname, "../../");
const OVERPASS_CLIENT_FILE = path.resolve(import.meta.dirname, "overpass-client.ts");
const THIS_FILE = path.resolve(import.meta.dirname, "overpass-url-single-module.test.ts");

const IGNORED_DIRS = new Set(["node_modules", ".next", "public", "test", "e2e", "coverage"]);

// Motif large : le nom d'hôte du serveur Overpass public, indépendamment du protocole/chemin exacts.
const OVERPASS_HOST_PATTERN = /overpass-api\.de/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".d.ts") && fullPath !== THIS_FILE) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("overpass-url-single-module — ADR-018 §3, critère d'acceptation L2 n°3", () => {
  const files = listSourceFiles(APP_ROOT);

  it("a bien trouvé des fichiers source à analyser", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("`overpass-client.ts` est bien marqué `import \"server-only\"`", () => {
    const content = readFileSync(OVERPASS_CLIENT_FILE, "utf-8");
    expect(content).toMatch(/^import\s+"server-only";/m);
  });

  it("l'URL du serveur Overpass n'apparaît QUE dans overpass-client.ts, nulle part ailleurs (aucun module client compris)", () => {
    const filesReferencingOverpass = files.filter((file) => OVERPASS_HOST_PATTERN.test(readFileSync(file, "utf-8")));
    expect(filesReferencingOverpass).toEqual([OVERPASS_CLIENT_FILE]);
  });

  it("aucun fichier sous components/map/** (client, next/dynamic ssr:false) ne référence l'URL Overpass", () => {
    const clientMapFiles = files.filter((file) => file.includes(`${path.sep}components${path.sep}map${path.sep}`));
    expect(clientMapFiles.length).toBeGreaterThan(0); // le socle L1 existe bien.
    for (const file of clientMapFiles) {
      expect(readFileSync(file, "utf-8")).not.toMatch(OVERPASS_HOST_PATTERN);
    }
  });
});
