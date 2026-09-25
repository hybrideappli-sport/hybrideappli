/**
 * URL du worker MapLibre — ADR-018, lot L1.
 *
 * POURQUOI UNE URL EN DUR PLUTÔT QU'UNE RÉSOLUTION PAR LE BUNDLER
 *
 * `maplibre-gl` v6 localise son worker relativement à son propre module, et l'heuristique ne
 * survit pas au bundling :
 *
 *     let base = import.meta.url;
 *     if (!/^https?:/.test(base)) return "";            // renvoie "" une fois bundlé
 *     return new URL("./maplibre-gl-worker.mjs", base).href;
 *
 * Sans URL explicite, `new Worker("", { type: "module" })` charge l'URL de la PAGE COURANTE, qui
 * répond du HTML — d'où l'erreur « non-JavaScript MIME type of 'text/html' » sur une requête qui
 * n'a jamais visé un fichier JavaScript.
 *
 * Laisser le bundler résoudre le chemin (`new URL("maplibre-gl/dist/…", import.meta.url)`) corrige
 * ce premier point mais pas le suivant : le worker importe `./maplibre-gl-shared.mjs`
 * relativement à lui-même, et cet import RESTE INTACT dans l'asset copié — le fichier émis, lui,
 * porte un hash de contenu. Le worker se charge alors correctement… puis échoue en 404 sur son
 * module partagé, et la carte reste bloquée sur son état de chargement.
 *
 * Le worker et son module partagé sont donc servis depuis `public/maplibre/`, côte à côte et sans
 * hash, où l'import relatif est correct par construction. Ils y sont copiés à chaque `dev` et
 * chaque `build` par `scripts/copy-maplibre-worker.mjs` — voir ce fichier pour le détail.
 *
 * Cette URL et le chemin de sortie du script doivent rester cohérents : les modifier séparément
 * remet la carte en panne, sans erreur de build.
 */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
