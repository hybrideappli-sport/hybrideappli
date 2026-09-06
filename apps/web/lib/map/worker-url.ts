/**
 * URL du worker MapLibre, résolue explicitement par le bundler — ADR-018, lot L1.
 *
 * POURQUOI CE MODULE EXISTE
 *
 * `maplibre-gl` (ESM, v6) localise son worker tout seul, relativement à son propre module :
 *
 *     function getWorkerUrl() {
 *       let base = import.meta.url;
 *       if (!/^https?:/.test(base)) return "";            // <-- le piège
 *       return new URL("./maplibre-gl-worker.mjs", base).href;
 *     }
 *
 * Cette heuristique suppose que `maplibre-gl.mjs` est servi tel quel, avec son worker en fichier
 * frère. Après passage par le bundler de Next.js, aucune des deux hypothèses ne tient : le module
 * est fondu dans un chunk de `/_next/static/chunks/`, le worker est émis à part dans
 * `/_next/static/media/` avec un hash de contenu dans son nom, et `import.meta.url` n'est plus une
 * URL `http(s)`. La garde ci-dessus renvoie donc `""`, et `new Worker("", { type: "module" })`
 * résout vers l'URL de la PAGE COURANTE (`/carte`), qui répond du HTML.
 *
 * Symptôme observé, et il n'est pas parlant du tout : la carte reste bloquée sur son état de
 * chargement, et la console affiche « Failed to load module script: The server responded with a
 * non-JavaScript MIME type of 'text/html' » — sans jamais nommer MapLibre ni le worker.
 *
 * `new URL(<littéral>, import.meta.url)` est en revanche un motif que le bundler reconnaît
 * STATIQUEMENT : il résout le spécificateur, émet l'asset et réécrit l'expression en URL servie
 * réelle. C'est la forme documentée pour référencer un worker, et la raison pour laquelle le
 * littéral ci-dessous ne doit jamais devenir une variable — l'analyse statique ne suivrait plus,
 * et la panne reviendrait silencieusement.
 */
export const MAPLIBRE_WORKER_URL = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href;
