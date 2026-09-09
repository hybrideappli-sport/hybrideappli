/**
 * Copie le worker MapLibre et son module partagé dans `public/maplibre/` — ADR-018, lot L1.
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 * `maplibre-gl` v6 découpe son code en trois fichiers : le module principal, un worker, et un
 * module `maplibre-gl-shared.mjs` que les deux importent. Le worker le charge par un import
 * RELATIF À LUI-MÊME (`from "./maplibre-gl-shared.mjs"`).
 *
 * Ce worker ne peut pas être bundlé par Next.js : c'est MapLibre qui l'instancie, à l'intérieur de
 * sa propre closure, via une URL qu'on lui donne par `setWorkerUrl()`. Le bundler ne voit donc
 * jamais de `new Worker(new URL(...))` à analyser. Il traite le fichier comme un ASSET, le copie
 * tel quel sous `/_next/static/media/` avec un hash de contenu — et laisse son import interne
 * intact. Le worker demande alors `/_next/static/media/maplibre-gl-shared.mjs`, alors que le
 * fichier réellement émis s'appelle `maplibre-gl-shared.<hash>.mjs` : 404, et la carte reste
 * bloquée sur son état de chargement.
 *
 * Servir les deux fichiers depuis `public/`, côte à côte et SANS hash, rend l'import relatif
 * correct par construction. C'est le seul endroit où l'on maîtrise leurs noms.
 *
 * Ces fichiers sont GÉNÉRÉS, pas versionnés (voir `.gitignore`) : les recopier à chaque `dev` et
 * chaque `build` garantit qu'ils suivent la version de `maplibre-gl` du lockfile. Les committer
 * les ferait diverger silencieusement au premier bump de version — précisément le genre de panne
 * que ce script existe pour éviter.
 */

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** Les deux fichiers doivent rester côte à côte : l'import relatif du worker en dépend. */
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

// Résolu via le `package.json` du paquet plutôt que par un chemin `node_modules/` en dur : pnpm
// n'installe pas à plat, le chemin réel dépend du store.
const distDir = join(dirname(require.resolve("maplibre-gl/package.json")), "dist");
const outDir = join(here, "..", "public", "maplibre");

mkdirSync(outDir, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(distDir, file), join(outDir, file));
}

console.log(`[maplibre] worker copié dans public/maplibre/ (${FILES.join(", ")})`);
