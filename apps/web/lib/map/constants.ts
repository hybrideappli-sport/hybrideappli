/**
 * Constantes du socle carte (ADR-018, lot L1). Valeurs nommées, ajustables sans changer
 * l'architecture — voir ADR-018 §4.4 (bornes dures) et question ouverte n°2 (garde-fou de
 * consommation Stadia).
 */

/**
 * Niveau de zoom slippy en-dessous duquel les tracés ne seront pas servis par `GET
 * /api/v1/map/trails` (lot L2, `TILE_ZOOM`, ADR-018 §4.2). Le lot L1 n'appelle jamais cette route
 * (aucun appel Overpass), mais affiche déjà l'état `zoom_required` dérivé du zoom courant de la
 * carte : c'est une information honnête, pas une promesse de contenu à venir.
 */
export const MAP_MIN_ZOOM_FOR_TRAILS = 12;

/**
 * Zoom maximal autorisé côté client (ADR-018, question ouverte n°2, levier « bornes de zoom ») :
 * supprime la classe de comportements les plus coûteux en crédits Stadia (zoom profond répété).
 */
export const MAP_MAX_ZOOM = 18;

/**
 * Zoom initial avant toute géolocalisation réussie — vue large, pas orientée sur un lieu précis
 * (aucune position par défaut n'est un choix produit ; c'est juste un cadrage neutre).
 */
export const MAP_DEFAULT_ZOOM = 5;

/** Centre par défaut (France métropolitaine, approx.) tant que la géolocalisation n'a pas répondu. */
export const MAP_DEFAULT_CENTER: [number, number] = [2.3522, 46.6031];

/**
 * Délai de « debounce » appliqué à `moveend`/`zoomend` avant de recalculer l'état dérivé du
 * viewport (`zoom_required` en L1, futur déclenchement du fetch de tracés en L2). ADR-018, question
 * ouverte n°2 : « le levier de premier rang » contre l'emballement de consommation Stadia — ne
 * jamais recalculer/refetcher pendant le geste, seulement à sa stabilisation.
 */
export const MAP_VIEWPORT_DEBOUNCE_MS = 400;

/**
 * Plafond de tuiles chargées sur la durée de vie de la page (ADR-018, question ouverte n°2, levier
 * « plafond client dans `transformRequest` »). Valeur de départ à calibrer sur une session de
 * navigation réelle (l'ADR le documente explicitement) — volontairement généreuse pour ne pas gêner
 * un usage normal, tout en bornant un emballement involontaire (panoramique/zoom en boucle).
 */
export const MAP_MAX_TILES_PER_SESSION = 1500;

/**
 * Plafond de features CLASSÉES conservées par tuile (lot L2, ADR-018 §4.4, ordre de grandeur
 * documenté par l'ADR). Appliqué APRÈS `classifySports()` — les chemins qu'aucun sport ne retient
 * sont déjà écartés avant ce plafond, jamais comptés dedans. Au-delà, `truncated: true` dans la
 * réponse de `GET /api/v1/map/trails` : jamais une troncature silencieuse. Levier de réglage du
 * volume par entrée de cache, dans l'ordre recommandé par l'ADR : `TILE_ZOOM`,
 * `SIMPLIFY_TOLERANCE_M`, puis cette constante.
 */
export const MAX_FEATURES_PER_TILE = 2000;

/**
 * Tolérance de simplification de géométrie (Douglas–Peucker, lot L2, ADR-018 §4.4) — en mètres,
 * invisible au zoom d'affichage (`MAP_MIN_ZOOM_FOR_TRAILS = 12`), division substantielle du nombre
 * de points avant mise en cache (N3). Fait partie des paramètres qui, s'ils changent, appellent un
 * bump de `OVERPASS_QUERY_VERSION` (`lib/map/overpass-query.ts`) : ils déterminent le contenu de ce
 * qui est mis en cache brut.
 */
export const SIMPLIFY_TOLERANCE_M = 5;
