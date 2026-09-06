# ADR-018 — Carte des tracés outdoor : MapLibre, fond de carte Stadia, et Overpass derrière un cache par tuiles

- **Statut** : Accepté
- **Date** : 2026-09-06
- **Mise à jour (2026-09-06, décision du fondateur)** : le classement des 4 sports se fait sur la **combinaison chemin + surface + difficulté**, et un même chemin peut appartenir à plusieurs filtres. Cette décision a rouvert l'arbitrage de cache posé initialement en §4.1 (une entrée par tuile × sport) : il est **révisé** au profit d'**une seule extraction Overpass par tuile, classée à la lecture** (§4.1, §5, §6). La question ouverte n°4 (« mapping des sports vers les tags OSM ») est tranchée et retirée.
- **Mise à jour (2026-09-06, décision du fondateur)** : le **point d'entrée de `/carte` est un lien depuis `/planning`** — la question ouverte n°1 est tranchée et retirée. **Pas de cinquième item dans la tab bar, pas de remplacement d'un item existant : elle reste à 4** (`docs/design-system.md` §4.9). Voir §Contexte constat 5 et le lot L1.
- **Décideur** : `architect`
- **Portée** : Feature — écran **Carte**, phase 1 (lecture seule)
- **Dépend de** : ADR-001 (PWA, API-first), ADR-007 (patron du **bloquant de mise en production documenté**), ADR-010 (RGPD, localisation, sous-traitants), ADR-013 (patron d'intégration tierce : clés, fail-closed, limitation de débit)
- **Ne touche pas** : ADR-004, ADR-005, ADR-016 — voir §7
- **Feature déclenchante** : écran **Carte**, phase 1 — brief du fondateur du 2026-09-06. La fiche `spec-writer` et les notes `designer` n'existent pas encore : cet ADR pose les décisions techniques et le découpage, il ne tient pas lieu de fiche fonctionnelle.

---

## Contexte

La phase 1 de l'écran Carte affiche les tracés outdoor autour de l'utilisateur, filtrables par sport (Route, Trail, Rando, Vélo), avec un bottom sheet au tap (nom, distance, dénivelé, surface). Trois contraintes sont posées comme non négociables par le fondateur : **MapLibre GL JS**, **OpenStreetMap via l'Overpass API**, **attribution ODbL visible**. Deux décisions produit sont déjà tranchées et ne sont pas rouvertes ici : le CTA « Utiliser pour ma séance » est **retiré** de la phase 1, et les couleurs de filtre sortent d'une **famille de tokens dédiée** (voir §7 et découpage L3).

Six constats tirés du dépôt et de la documentation des fournisseurs conditionnent la réponse.

1. **Aucune infrastructure de cache partagé n'existe dans le projet.** Pas de Redis, pas d'Upstash — le raisonnement est déjà écrit dans `apps/web/lib/rate-limit/fixed-window-limiter.ts` (« introduire une dépendance externe pour UN SEUL endpoint serait disproportionné »). Le seul cache partagé disponible sans nouvelle dépendance est le **Data Cache de Next.js** (`unstable_cache`), le dépôt n'ayant pas activé `cacheComponents` (`apps/web/next.config.ts`) et restant donc sur le modèle de cache antérieur.

2. **La phase 1 n'écrit rien en base.** Décision du fondateur : « strictement lecture seule, aucune écriture en base, aucune nouvelle table ». Une table de cache Postgres est donc exclue **par le périmètre lui-même**, pas seulement par préférence technique.

3. **Toutes les routes `/api/v1/**` sont authentifiées et répondent `Cache-Control: no-store`** (`apps/web/app/api/v1/**`, 20 occurrences vérifiées). Aucune route du dépôt n'est aujourd'hui mise en cache côté CDN, et `requireUser()` s'appuie sur `supabase.auth.getUser()` qui peut émettre un `Set-Cookie` de rafraîchissement de session — ce qui **désactive** le cache partagé d'un CDN.

4. **Le plan Vercel est Hobby** (ADR-011, mise à jour du 2026-08-19), et il n'existe **aucun service worker** dans `apps/web` (seule `api/v1/push/subscriptions` mentionne le sujet). Aucune tolérance hors-ligne n'est donc disponible pour les tuiles ou les tracés.

5. **La tab bar compte exactement 4 items** (`apps/web/components/layout/tab-bar.tsx`, `docs/design-system.md` §4.9 : « 4 items »). Un cinquième item n'est pas une décision d'`architect` — c'est le même point d'entrée manquant que le R7 de l'US-03. **Tranché par le fondateur le 2026-09-06** : la tab bar **reste à 4 items**, `/carte` est atteint par un **lien depuis `/planning`** (lot L1). Ni cinquième item, ni remplacement.

6. **Faits fournisseurs vérifiés le 2026-09-06** (sources atteintes : `stadiamaps.com/pricing/`, `docs.stadiamaps.com/`, `docs.stadiamaps.com/themes/`, `maptiler.com/cloud/pricing/`, `maptiler.com/maps/`) :

| | **Stadia Maps** | **MapTiler Cloud** |
|---|---|---|
| Palier gratuit | 0 $, 200 000 crédits/mois, **« Basic APIs only »**, **usage commercial non autorisé** | 0 $, 5 000 sessions carte + 100 000 requêtes API/mois, **« testing, personal or non-commercial use »**, **logo MapTiler obligatoire** |
| 1ᵉʳ palier commercial | **Starter, 20 $/mois**, 1 000 000 crédits, dépassement 3 ¢/1 000 | **Flex, 30 $/mois**, 25 000 sessions + 500 000 requêtes, dépassement facturé automatiquement |
| Paliers suivants | Standard 80 $ (7,5 M), Professional 250 $ (25 M) | Custom (volume prépayé, SLA 99,9 %) |
| Style outdoor | **Outdoors** (« ski slopes, mountains, parks, and paths »), **Stamen Terrain** (ombrage + végétation) | **Outdoor** (sentiers rando/vélo, courbes de niveau, ombrage) |
| Style sombre | **Alidade Smooth Dark** | non listé sur la page atteinte — *à confirmer* |
| **Style sombre outdoor natif** | **non** | **non** |
| Styles personnalisés | oui, annoncés dans `docs.stadiamaps.com/themes/` ; **gating par palier non vérifiable** (`/themes/custom-styles/` renvoie 403 à l'outil de récupération) | oui (MapTiler Customize) ; **gating par palier non vérifié** |
| Routage | **Valhalla** : directions, map matching, isochrones, matrice, *nearest roads*, *trace attributes* | **aucune API de routage** mentionnée |
| Élévation | **oui** — « get elevation at a point, or build a profile along a path » | non mentionnée |
| Géocodage | oui (Pelias) | oui |
| Siège / juridiction | **États-Unis** | **Suisse** |

**Le fait décisif du tableau n'est pas le prix, c'est la colonne « aucune API de routage ».**

---

## Décision

### 1. Fond de carte : **Stadia Maps**, palier **Starter (20 $/mois)** avant toute mise en production

Trois raisons, par ordre de poids.

**a) Un seul sous-traitant au lieu de deux.** La phase 2 (import GPX) et tout ce qui suit — profil altimétrique d'un tracé, « rejoindre le départ », correction d'une trace vers le réseau routier — appellent du **routage** et de l'**élévation**. Stadia les sert depuis le même abonnement, la même clé et le même pool de crédits. MapTiler n'a ni l'un ni l'autre : le retenir imposerait d'ajouter un second fournisseur en phase 2. Or, dans ce projet, un sous-traitant supplémentaire n'est pas une ligne de facture : c'est un DPA à signer, une entrée au registre des traitements, une clé à gérer, une doctrine fail-closed à écrire (ADR-010 §4, ADR-013 §2). Le coût réel de MapTiler est donc « 30 $/mois **plus** un second contrat six mois plus tard ».

**b) L'élévation débloque le dénivelé.** OpenStreetMap **ne porte pas le dénivelé** : le tag `ascent` n'existe que sur une minorité de relations d'itinéraire. Le champ « dénivelé » de la bottom sheet est donc structurellement `null` en phase 1 (voir §6). L'Elevation API de Stadia (profil altimétrique le long d'un tracé) est la seule voie identifiée pour le renseigner sans nouveau fournisseur — et elle arrive avec l'abonnement qui est de toute façon obligatoire pour la production.

**c) Le palier commercial est moins cher et se compare mieux.** 20 $ contre 30 $, et surtout 1 000 000 de crédits contre 25 000 sessions : le modèle « crédits » de Stadia laisse arbitrer entre affichage de carte et appels API sans changer de palier, là où le modèle « sessions » de MapTiler impose de raisonner en nombre d'ouvertures d'écran.

**Ce que MapTiler avait pour lui, et qui est écarté en connaissance de cause** : MapTiler est **suisse** (décision d'adéquation), Stadia est **américain**. Sur un produit dont l'ADR-010 impose un traitement UE pour les données de santé, ce n'est pas rien. C'est traité en §7 et en Conséquences, et cela reste le principal regret de cette décision.

### 2. Le style sombre outdoor est un **livrable, pas un choix de catalogue**

Aucun des deux fournisseurs ne propose de style sombre orienté outdoor. Deux voies, dans cet ordre :

- **Phase 1, immédiatement disponible** : `alidade_smooth_dark`, le seul style sombre de Stadia, aligné avec `--color-background` `#0A0A0A` du thème sombre unique (`docs/design-system.md` §1.1). Il ne montre ni sentiers ni relief : c'est un **fond**, et les tracés sont dessinés par-dessus par nos propres couches (§3). L'écran est donc complet et cohérent sans style personnalisé.
- **Avant production (lot L4)** : style personnalisé, fork de **Outdoors** recoloré sur la palette de l'app (ou `alidade_smooth_dark` augmenté des couches de relief), produit par `designer` et publié côté Stadia. Le code ne connaît qu'**une URL de style dans une variable d'environnement** : passer de l'un à l'autre n'est pas un déploiement de code.

Cette indirection est la garantie anti-verrouillage : MapLibre + OSM + une URL de style. Changer de fournisseur, si Stadia déçoit, c'est changer une variable d'environnement et un texte d'attribution.

### 3. **Aucun appel Overpass depuis le client** — la route API est le seul chemin

```
navigateur ──bbox──▶ GET /api/v1/map/trails ──▶ [N3 Data Cache : données BRUTES]
                     (arrondi serveur)                    │
                                                          ├─miss─▶ Overpass (1 requête / tuile)
                                                          │
                                                          └──▶ classifySports() ──▶ réponse
                                                               (pur, versionné à part)
```

Le client MapLibre parle à **deux** hôtes et pas un de plus : le CDN de tuiles de Stadia, et notre propre API. L'URL du serveur Overpass vit dans **un seul module**, `apps/web/lib/map/overpass-client.ts`, marqué `import "server-only"`. La règle est vérifiable par `grep`, exactement comme le chemin d'écriture unique d'ADR-004 §2 et de l'ADR-016 §2 — et elle est testée (découpage L2).

**Le client n'envoie jamais de position précise, et n'envoie jamais de clé de cache.** Il envoie sa `bbox` de viewport ; **c'est le serveur qui l'arrondit**. L'arrondi est ainsi un invariant serveur, impossible à contourner en fabriquant une requête à la main.

### 4. Stratégie de cache : **une extraction brute par tuile, classée à la lecture**, TTL 24 h

#### 4.1 L'arbitrage : entrée par (tuile × sport), ou entrée unique par tuile ?

La première version de cet ADR posait **une entrée de cache par (tuile × sport)**, soit jusqu'à 4 requêtes Overpass par tuile. La décision du fondateur sur le classement (combinaison chemin + surface + difficulté, **chevauchement assumé**) rend cette forme inférieure sur les trois critères que cet ADR s'est lui-même fixés. L'arbitrage est donc **révisé**.

| Critère | A — une entrée par (tuile × sport) | B — une extraction brute par tuile, classée à la lecture |
|---|---|---|
| Requêtes Overpass par tuile | jusqu'à **4** | **1** |
| Ce qui est téléchargé | 4 sous-ensembles **qui se recouvrent** : leur somme dépasse leur union | l'union, **une fois** |
| Chevauchement d'un chemin | dupliqué dans 2 à 3 entrées ; dédoublonnage obligatoire à l'affichage | naturel : une géométrie, `sports: string[]` |
| Réglage du classement (fréquent) | **jette toute la donnée brute** et refrappe Overpass sur toutes les tuiles | **coût nul sur Overpass** — la donnée brute est intacte |
| Volume d'une entrée | plus petit | plus gros (tags non utilisés par tous les filtres) |
| Requête avec un seul filtre actif | ne télécharge que ce filtre | télécharge l'union |

**Décision : B.** Trois raisons, la troisième étant décisive.

1. **A est plus coûteux pour Overpass, pas moins.** « Route » et « Vélo » partagent les voies revêtues ; « Trail » est presque entièrement inclus dans « Rando ». Les quatre requêtes ramènent donc largement la même donnée, en consommant quatre créneaux d'exécution sur une infrastructure bénévole au lieu d'un. Sur la métrique que cet ADR se donne — protéger Overpass — A perd.
2. **Le chevauchement cesse d'être un cas à traiter.** Sous A, un chemin appartenant à trois sports existe en trois exemplaires sans lien entre eux ; sous B, il existe une fois, avec `sports: ['route', 'bike']`. Le comportement voulu par le fondateur devient la forme naturelle de la donnée.
3. **Extraction et classement se versionnent séparément.** C'est le point qui tranche. Le classement est un **réglage produit** : il bougera (seuils de largeur, traitement des `surface` absentes, périmètre de « Route »). Sous A, `QUERY_VERSION` soudait les deux : ajuster un seuil invalidait la donnée brute et déclenchait une vague de requêtes Overpass sur toutes les tuiles consultées. Sous B, il y a **deux versions indépendantes** :

```
OVERPASS_QUERY_VERSION  → change SEULEMENT si la requête d'extraction change   (coûteux, rare)
CLASSIFIER_VERSION      → change à chaque ajustement de classement             (gratuit, fréquent)
```

Seul `OVERPASS_QUERY_VERSION` entre dans la clé du cache brut. **Retoucher le classement ne coûte pas une requête Overpass** — et c'est exactement la propriété qu'on veut, puisque c'est ce qui va bouger.

**Contrepartie assumée, et sa condition de validité** : le cache brut doit contenir **tous les tags dont un futur classement pourrait avoir besoin**. Si un réglage exige un tag non extrait, il faut malgré tout bumper `OVERPASS_QUERY_VERSION` et le bénéfice disparaît pour ce coup-là. La liste blanche de tags de §5.5 est donc **délibérément généreuse** : on paie quelques octets par chemin pour que le réglage reste gratuit. C'est un arbitrage explicite, pas un oubli.

#### 4.2 La clé : une tuile slippy z12, pas une bbox arrondie à N décimales

Arrondir la bbox de l'utilisateur à 2 ou 3 décimales **ne suffit pas** : la bbox arrondie conserve la **taille du viewport**, qui dépend de la taille d'écran et du niveau de zoom. Deux utilisateurs côte à côte produiraient deux clés différentes, et le taux de hit tomberait à quasi zéro — ce qui est précisément le contraire de l'objectif.

Retenu : la bbox reçue est **projetée sur la grille de tuiles WebMercator standard au zoom 12** (≈ 9,8 × 6,9 km à 45° de latitude, constante nommée `TILE_ZOOM`). Le serveur calcule la liste des tuiles qui intersectent la bbox et ne travaille plus jamais qu'en tuiles.

```
clé N3 = ['overpass', OVERPASS_QUERY_VERSION, `${z}/${x}/${y}`]     // 1 entrée par tuile, sans sport
```

Trois propriétés en découlent :

- **La grille est absolue, pas relative à l'utilisateur.** Deux utilisateurs du même quartier, à des zooms différents, sur des écrans différents, tapent la **même** entrée de cache.
- **Le panoramique est gratuit.** Se déplacer d'une tuile ne redemande que la tuile entrante.
- **`OVERPASS_QUERY_VERSION` invalide sans purge.** Les anciennes entrées deviennent inatteignables et expirent seules. Même principe que l'immuabilité des `rulesets` (ADR-007 §1) : on ne modifie pas, on versionne.

`TILE_ZOOM` est une **constante nommée, à réévaluer sur données réelles au point de validation de fin de L2** : une grille plus fine réduit le volume par entrée mais multiplie les requêtes, une grille plus grossière fait l'inverse. Le §4.4 explique pourquoi le volume est ici la contrainte serrante.

#### 4.3 Où le cache vit : les quatre niveaux, et lequel protège réellement Overpass

| Niveau | Support | Portée | TTL | Ce qu'il protège |
|---|---|---|---|---|
| **N1** | `Map<tuile, FeatureCollection>` dans le composant carte | onglet, session | durée de vie de la page | le réseau, pendant le panoramique/zoom **et à chaque changement de filtre** (§6) |
| **N2** | En-tête `Cache-Control: private, max-age=600` | navigateur, un utilisateur | 10 min | le rechargement et le retour arrière |
| **N3** | **Data Cache Next.js** (`unstable_cache`, `next/cache`) — **données brutes, non classées** | **toutes les instances, tous les utilisateurs** | **86 400 s (24 h)** | **Overpass — c'est le seul niveau qui compte** |
| **N4** | `FixedWindowRateLimiter` (existant) | instance | fenêtre 60 s | Overpass, en dernier recours, si N3 échoue |

**N3 est la décision.** Il garantit **au plus une requête Overpass par tuile par 24 heures, pour l'ensemble des utilisateurs**. Une zone urbaine dense consultée par cent utilisateurs coûte une requête Overpass par jour.

**TTL de 24 h** : la géométrie outdoor d'OSM (chemins, sentiers, relations d'itinéraire) évolue à l'échelle de la semaine. 24 h borne la fraîcheur à une journée — largement en deçà de la vitesse de changement réelle de la donnée — tout en divisant la charge Overpass par le nombre de consultations quotidiennes. Un TTL plus court n'apporterait aucune fraîcheur utile et augmenterait la charge sur une infrastructure bénévole ; un TTL plus long ferait dériver l'affichage par rapport à une correction OSM récente sans gain marginal.

**Le classement s'applique après N3, à chaque requête.** `CLASSIFIER_VERSION` n'entre donc pas dans la clé N3, mais il est renvoyé en en-tête de réponse et entre dans la clé N1 : un déploiement qui change le classement ne peut pas servir une classification périmée depuis la mémoire du client. Fenêtre résiduelle connue : jusqu'à 10 minutes via N2 (`max-age=600`) — acceptable pour un réglage d'affichage.

**N2 est délibérément `private`, jamais `s-maxage`.** Un cache CDN partagé sur une route authentifiée est à la fois un risque de fuite et un mécanisme fragile ici : `requireUser()` peut faire émettre un `Set-Cookie` de rafraîchissement de session, ce qui désactive silencieusement la mise en cache partagée. N3 produit le même effet — un travail fait une fois pour tous — sans aucun de ces deux problèmes.

**N4 réutilise l'existant sans nouvelle dépendance**, dans les deux sens : un limiteur d'**entrée** par utilisateur (garde contre un client qui boucle) et un limiteur de **sortie** par instance sur les appels Overpass, avec une concurrence sortante bornée à 2 — la politique d'usage des serveurs Overpass publics raisonne en créneaux simultanés par IP. Le gabarit Overpass QL porte un `[timeout:25]` explicite et un `User-Agent` identifiant l'application et un contact, comme l'exige la politique d'usage OSM.

#### 4.4 Bornes dures : le volume devient la contrainte serrante

Extraire l'union plutôt que quatre sous-ensembles déplace le point de tension du **nombre de requêtes** vers le **volume par entrée**. Quatre garde-fous, tous des constantes nommées :

- **Périmètre d'extraction restreint aux voies dédiées** (§5.5) : la voirie ordinaire est exclue. C'est ce qui rend l'union tenable à `TILE_ZOOM = 12` — sans cette restriction, une tuile urbaine dense contiendrait tout le réseau de rues, soit un volume hors de portée.
- **Élagage des propriétés** : seuls les tags de la liste blanche §5.5 sont conservés ; tout le reste est jeté avant mise en cache.
- **Simplification de géométrie** (Douglas–Peucker, `SIMPLIFY_TOLERANCE_M`, ≈ 5 m) : invisible au zoom d'affichage, division substantielle du nombre de points.
- **Plafond `MAX_FEATURES_PER_TILE`** (ordre de grandeur : 2 000) appliqué **après** classement — les chemins qu'aucun sport ne retient sont écartés en premier. Au-delà, `truncated: true` dans la réponse et mention discrète dans l'UI : jamais une troncature silencieuse.

Et deux bornes sur la requête elle-même :

- **Zoom minimum requis.** En dessous de z12, la réponse est un `200` portant `status: 'zoom_required'` — jamais une requête Overpass sur un continent. Une impossibilité expliquée n'est pas une panne (même doctrine que `status: 'calibration'` et que `outcome: 'cancelled_week'`, plan US-03 §2).
- **Plafond de 9 tuiles par requête.** Au-delà, même réponse `zoom_required`.
- **Dégradation explicite.** Si une partie des tuiles échoue (Overpass indisponible, `429`, timeout), la réponse reste `200` avec `degraded: true` et les tuiles servies ; l'UI l'affiche. Seul un échec total renvoie une erreur (`502 OVERPASS_UNAVAILABLE`, code à ajouter à `ApiErrorCode`).

### 5. Classification des 4 sports : une fonction pure de tags, versionnée à part

> Cette section tranche l'ancienne question ouverte n°4, sur la base de la décision du fondateur du 2026-09-06 : **filtrage sur la combinaison chemin + surface + difficulté**, **chevauchement voulu**.

#### 5.1 Où elle vit

```ts
// packages/domain/src/map-trails.ts
export function classifySports(tags: OsmTags): MapSport[];   // pur, 0 I/O, déterministe
export const CLASSIFIER_VERSION: string;
```

Fonction **pure**, dans `@hybride/domain` — pas dans `@hybride/rules-engine`. Le précédent est explicite (ADR-016 §5) : le placement horaire a rejoint le moteur **uniquement parce qu'il devait revérifier des garde-fous de sécurité**. Le classement d'un sentier n'en est pas un : aucune borne de charge, aucune donnée de santé, aucune conséquence sur un plan. L'y mettre diluerait la frontière que l'ADR-002 protège. `@hybride/domain` la rend néanmoins partageable avec l'import GPX de la phase 2, qui aura le même besoin.

#### 5.2 Prédicats dérivés (les seuils exacts sont ici, pas dans le code appelant)

| Prédicat | Définition retenue |
|---|---|
| **revêtu** | `surface ∈ { asphalt, chipseal, concrete, concrete:plates, concrete:lanes, paved, paving_stones, sett }` |
| **non revêtu** | `surface` présent et hors de la liste ci-dessus (`ground`, `dirt`, `grass`, `gravel`, `compacted`, `fine_gravel`, `sand`, `rock`, `mud`…) |
| **revêtement présumé** (si `surface` absent) | `cycleway`, `footway`, `pedestrian` → **revêtu** · `path`, `bridleway` → **non revêtu** · `track` → `tracktype=grade1` **revêtu**, sinon **non revêtu**. Marqué `surfaceInferred: true`. |
| **étroit** (« sentier ») | `highway ∈ { path, footway, bridleway }` **et** (`width` absent **ou** `width ≤ 2 m`) |
| **technique** | `sac_scale ∈ { demanding_mountain_hiking, alpine_hiking, demanding_alpine_hiking, difficult_alpine_hiking }` **ou** `mtb:scale ≥ 2` **ou** `trail_visibility ∈ { bad, horrible, no }` **ou** `smoothness ∈ { very_bad, horrible, very_horrible, impassable }` |
| **piéton admis** | `foot ∈ { yes, designated, permissive }` **ou** `highway ∈ { path, footway, pedestrian, track, bridleway }` — et jamais si `foot = no` |
| **vélo admis** | `bicycle ∈ { yes, designated, permissive }` **ou** `highway = cycleway` — et jamais si `bicycle = no` |

**Le revêtement présumé sert au classement, jamais à l'affichage.** Quand `surfaceInferred` est vrai, la bottom sheet affiche « non renseignée » et non la valeur déduite : on ne fabrique pas une donnée qu'OSM ne porte pas. Cette règle vaut aussi pour le dénivelé (§6).

#### 5.3 Les quatre sports

| Filtre | Règle | Lecture |
|---|---|---|
| **Route** | piéton admis **et** revêtu **et** non technique | voies vertes, berges, allées de parc, pistes cyclables asphaltées ouvertes aux piétons |
| **Trail** | piéton admis **et** non revêtu **et** étroit | sentier simple, quelle que soit la difficulté |
| **Rando** | piéton admis **et** non revêtu | tous les non-revêtus, larges comme étroits, **y compris techniques** |
| **Vélo** | vélo admis **et** (`highway = cycleway` **ou** revêtu) | pistes cyclables, et voies partagées revêtues |

#### 5.4 Le chevauchement est le comportement attendu, pas une collision

`classifySports()` renvoie un **tableau**. Les inclusions et intersections suivantes sont **voulues** et font l'objet de tests dédiés :

- **Trail ⊂ Rando** — par construction : tout sentier étroit non revêtu est aussi une rando. Ce n'est pas une redondance à corriger.
- **Route ∩ Vélo** — une piste cyclable asphaltée ouverte aux piétons est dans les deux.
- **Un chemin sans aucun sport est écarté** avant plafonnement (§4.4) : il n'est jamais envoyé au client.

Conséquence à traiter côté rendu, et **elle n'est pas gratuite** : contrairement au cache, l'affichage doit décider **quelle teinte porte un chemin appartenant à deux filtres actifs**. Priorité fixe entre sports, tracé double, ou style « multi » : c'est une décision de `designer` (question ouverte 3). En attendant, la géométrie n'est dessinée **qu'une fois** (dédoublonnage par `osmId`) — jamais deux traits superposés.

#### 5.5 Requête d'extraction (`OVERPASS_QUERY_VERSION`)

**Voies retenues** — `highway ∈ { path, footway, cycleway, bridleway, track, pedestrian }`, hors `access ∈ { private, no }`.
**Relations d'itinéraire** — `type = route` avec `route ∈ { hiking, foot, running, bicycle }` : ce sont les seuls objets OSM qui portent de façon fiable un **nom** et une **distance**, c'est-à-dire deux des quatre champs de la bottom sheet. Classement direct par le tag `route` (`running` → Route, `hiking`/`foot` → Rando, `bicycle` → Vélo).

**La voirie ordinaire (`residential`, `service`, `tertiary`…) est exclue**, pour deux raisons : le fond de carte la dessine déjà — la superposer serait du bruit visuel redondant — et elle ferait exploser le volume par tuile (§4.4). « Route » désigne donc les **voies dédiées revêtues**, pas le réseau de rues. C'est une lecture de la règle du fondateur, signalée comme telle en question ouverte 4.

**Liste blanche de tags conservés** — délibérément plus large que ce que le classement actuel consomme (§4.1, contrepartie) :
`name`, `highway`, `surface`, `tracktype`, `smoothness`, `sac_scale`, `mtb:scale`, `trail_visibility`, `width`, `foot`, `bicycle`, `horse`, `access`, `incline`, `ascent`, `distance`, `route`, `network`, `ref`, `operator`, `sport`, `segregated`, `lit`, `oneway`.

**Chevauchement de tuiles** : Overpass renvoie la géométrie complète d'un chemin dont un nœud est dans la bbox ; un chemin à cheval sur deux tuiles apparaît donc dans les deux entrées. Le dédoublonnage par `osmId` à la composition de la réponse est obligatoire.

### 6. Contrat de la route — et ce qu'il ne porte pas

```ts
// GET /api/v1/map/trails?bbox=minLon,minLat,maxLon,maxLat
type MapTrailsResponse = {
  status: 'ok' | 'zoom_required';
  degraded: boolean;              // au moins une tuile n'a pas pu être rafraîchie
  truncated: boolean;             // plafond MAX_FEATURES_PER_TILE atteint
  tiles: string[];                // '12/2062/1408' — tuiles effectivement servies
  attribution: string;            // '© les contributeurs d’OpenStreetMap'
  trails: MapTrailFeature[];      // GeoJSON Feature<LineString | MultiLineString>
};

type MapTrailProperties = {
  osmId: string;                  // 'way/1234567' | 'relation/98765' — identité OSM stable
  sports: MapSport[];             // 1 à 4 valeurs — le chevauchement est porté ici
  name: string | null;
  distanceKm: number | null;      // calculée sur la géométrie, ou tag `distance`
  elevationGainM: number | null;  // TOUJOURS null en phase 1 — voir ci-dessous
  surface: string | null;         // null si `surfaceInferred` — jamais la valeur déduite
  surfaceInferred: boolean;
  osmUrl: string;                 // lien de vérification, exigence de traçabilité ODbL
};
```

**Il n'y a pas de paramètre `sports`.** La route renvoie l'union classée de la tuile, et **le filtrage par pastille est purement côté client**. Trois bénéfices : cocher ou décocher un filtre ne produit **aucune requête réseau**, la clé de N1 et N2 ne dépend que de la tuile, et le chevauchement se règle une seule fois, à l'affichage. Le coût — envoyer des chemins que l'utilisateur a masqués — est celui-là même que le cache a déjà payé, et il disparaît dès le premier changement de filtre.

**Aucun identifiant utilisateur, aucun champ de plan, aucun `planned_session_id`, aucune date.** Comme pour `PlacementDecision` (ADR-016 §5), le périmètre « lecture seule, aucun lien avec le moteur » devient une **propriété de type** vérifiée par le compilateur, et non une vigilance de relecture. Le CTA « Utiliser pour ma séance » de la phase 2 aura besoin d'un champ que ce type ne porte pas : c'est voulu.

**`elevationGainM` est `null` en phase 1, et l'UI doit afficher « — ».** OSM ne porte pas le dénivelé de façon fiable. C'est un **écart assumé au brief** : le champ est présent au contrat, la valeur ne l'est pas encore. Le renseigner suppose l'Elevation API de Stadia, donc le palier payant (lot L4, conditionnel).

### 7. Ce que la phase 1 n'écrit pas, et ce qu'elle ne touche pas

- **Zéro migration, zéro table, zéro colonne.** Rien n'est ajouté à `supabase/migrations/`. Le numéro `0029` reste libre.
- **Zéro impact moteur.** Aucun appel à `generatePlan()`, `regeneratePlan()`, `materializePlanVersion()`, `placeWeekSessions()`, `materializeSessionPlacements()`. Aucun `decision_trace`, aucune `plan_version`, aucun `session_placement`. **L'ADR-016 n'est ni amendé ni complété** : le placement horaire ignore l'existence de la carte, et réciproquement. C'est la conséquence directe du retrait du CTA « Utiliser pour ma séance ».
- **Zéro donnée de santé.** La position de l'utilisateur est obtenue par `navigator.geolocation`, reste dans le navigateur, et n'est transmise à notre serveur que sous la forme d'une bbox de viewport, **immédiatement arrondie et jamais persistée**. Les journaux serveur ne consignent que la **clé de tuile**, jamais la bbox brute.
- **Suppressibilité.** Supprimer `app/(app)/carte/`, `app/api/v1/map/`, `lib/map/`, `components/map/` et `packages/domain/src/map-trails.ts` retire intégralement la feature, sans migration de retrait ni donnée orpheline. C'est le principal bénéfice architectural de la décision « phase 1 strictement lecture seule ».

### 8. Le bloquant de mise en production est **exécutable**, pas documentaire

Les paliers gratuits des deux fournisseurs interdisent l'usage commercial. Sur le patron d'ADR-007 (« tant que les paramètres sont `null`, l'environnement de production refuse le démarrage »), le bloquant n'est pas une note dans un document : c'est un garde **fail-closed**, dans la lignée de `STRIPE_WEBHOOK_SECRET` et `STRAVA_WEBHOOK_SUBSCRIPTION_ID` (ADR-013).

```
MAP_TILES_PROVIDER=stadia
MAP_TILES_STYLE_URL=            # URL de style ; sombre outdoor personnalisé en L4
NEXT_PUBLIC_MAP_TILES_API_KEY=  # clé publique, restreinte par domaine référent
MAP_TILES_PLAN=free_non_commercial | commercial
```

> En `NODE_ENV=production`, si `MAP_TILES_PLAN !== 'commercial'`, la page `/carte` et la route `/api/v1/map/trails` répondent **503 explicite** avant tout travail. Aucune carte n'est servie en production sur un palier non commercial.

Deux exigences complémentaires, portées par `devops` au moment de la souscription :

- **Clé restreinte par domaine référent** côté fournisseur. La clé de tuiles est nécessairement publique (le navigateur charge le style et les tuiles) : la restriction par domaine est la seule protection réelle. Attention aux domaines de prévisualisation Vercel, qui changent à chaque déploiement.
- **Alerte de quota.** Le palier Starter facture le dépassement (3 ¢/1 000 crédits) sans plafond : une alerte à 70 % du quota mensuel est requise avant l'ouverture au public.

### 9. Attribution ODbL : visible, non repliable, et testée

`AttributionControl` de MapLibre, **`compact: false`**, affiché en permanence sur la carte, portant **« © les contributeurs d'OpenStreetMap »** ainsi que l'attribution du fournisseur de fond de carte. La chaîne exacte est une constante unique du code, et sa présence dans le DOM est vérifiée par un test E2E : c'est une **obligation de licence**, elle ne peut pas dépendre de la vigilance d'un futur refactor de l'UI. Chaque tracé de la bottom sheet porte en outre son `osmUrl`, qui rend la donnée vérifiable à la source.

---

## Conséquences

**Positives**

- **La feature est entièrement réversible.** Aucune migration, aucune table, aucune ligne écrite : elle se supprime en effaçant quatre répertoires et un fichier. Aucune autre feature du produit n'a cette propriété.
- **Overpass est protégé par construction, pas par discipline** : une requête par tuile et par 24 h, tous utilisateurs confondus, doublée d'un limiteur de sortie.
- **Le réglage du classement est gratuit.** Ajuster un seuil de largeur ou le traitement d'un `surface` manquant ne coûte **aucune** requête Overpass. C'est ce qui rend le mapping réellement itérable, alors que c'est justement la partie du système dont on sait qu'elle sera fausse au premier essai.
- **Le chevauchement multi-sports est porté par la donnée** (`sports: MapSport[]`), pas par une duplication d'entrées de cache ni par une convention implicite.
- **Le filtrage est instantané et hors-ligne** : changer de pastille ne touche jamais le réseau.
- **L'arrondi est un invariant serveur.** Le client ne choisit pas la clé de cache et ne peut pas la contourner.
- **Pas de verrouillage fournisseur.** MapLibre + OSM + une URL de style en variable d'environnement.
- **Le même abonnement débloque les phases suivantes** : routage Valhalla et profil altimétrique, sans second contrat ni second DPA.
- **Le retrait du CTA sanctuarise la frontière** : le type de sortie ne porte aucun champ de plan, donc aucun développeur ne peut « brancher rapidement » la carte sur le moteur sans amender ce contrat, un ADR, et une revue.

**Négatives / à surveiller**

- **Les entrées de cache sont plus volumineuses**, et contiennent des tags qu'aucun filtre ne consomme aujourd'hui. C'est le prix explicite de l'indépendance extraction/classement (§4.1). À mesurer au point de validation de fin de L2 : si le volume par tuile dérape, les leviers sont `TILE_ZOOM`, `SIMPLIFY_TOLERANCE_M` et la liste blanche de tags — dans cet ordre.
- **Le classement s'exécute à chaque requête**, sur potentiellement des milliers d'objets. Si le profilage le justifie, un cache mémoire d'instance du résultat **classé**, clé `(tuile, OVERPASS_QUERY_VERSION, CLASSIFIER_VERSION)`, se pose sans rien changer d'autre. **À ne pas écrire avant de l'avoir mesuré.**
- **« Route » exclut la voirie ordinaire** (§5.5). Un utilisateur qui court sur route pourrait s'attendre à voir les rues surlignées ; elles restent visibles via le fond de carte. À valider sur maquette (question ouverte 4).
- **Le VTT et le gravel ne sont couverts par aucun filtre** : « Vélo » = cycleway + revêtu partagé, par décision du fondateur. Un single-track roulant apparaît en Trail/Rando, jamais en Vélo.
- **Le fournisseur retenu est américain.** MapTiler (Suisse) aurait été plus simple au regard de la doctrine ADR-010 §5. Contrepartie : aucune donnée de santé, aucun identifiant utilisateur, aucune position précise ne transite vers Stadia ; ce qui transite est l'IP du navigateur et le viewport — inévitable avec **tout** fournisseur de tuiles hébergé. **À faire par `devops` avant production** : DPA signé, base de transfert vérifiée, entrée au registre des traitements, mention dans la politique de confidentialité.
- **Le Data Cache est vidé à chaque déploiement** (la clé inclut le *build id*). Les premières minutes après un déploiement produisent une rafale de requêtes Overpass. Le limiteur de sortie N4 est là pour ça ; à surveiller si la cadence de déploiement augmente.
- **`maplibre-gl` est une dépendance lourde** (plusieurs centaines de kio). Chargement obligatoire via `next/dynamic` avec `ssr: false`, sur la seule route `/carte` : l'écran ne doit jamais peser sur le Dashboard.
- **Le dénivelé est vide en phase 1.** L'écran affiche « — » sur l'une des quatre données annoncées de la bottom sheet.
- **La qualité du classement dépend du renseignement d'OSM.** `surface` est absent sur une part importante des chemins, `width` sur la quasi-totalité : le prédicat « étroit » repose donc en pratique sur `highway`, et le revêtement sur une présomption. Zones rurales mal cartographiées ⟹ l'état « aucun résultat » sera fréquent, et doit être soigné plutôt que traité comme un cas limite.
- **Aucune tolérance hors-ligne.** Pas de service worker (constat 4) : sans réseau, la carte est blanche.
- **Coût variable non plafonné** au-delà du quota Starter — d'où l'alerte de quota exigée en §8.
- **Le style sombre outdoor est à produire et à maintenir.** Un fork de style est un actif de design qui vieillit avec les mises à jour du style amont.

---

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| **MapTiler** comme fond de carte | Aucune API de routage ni d'élévation : imposerait un **second fournisseur** en phase 2 (contrat, DPA, registre, clé, code) et laisserait le dénivelé sans solution. Palier commercial plus cher (30 $ vs 20 $). Avantage réel — juridiction suisse — jugé insuffisant face à ce cumul, les données transmises étant limitées à l'IP et au viewport. |
| Mapbox GL JS | Licence non open source et facturation au *map load* — contraire à la contrainte imposée (MapLibre). |
| Leaflet + tuiles raster | Pas de style vectoriel paramétrable : le fond sombre de la charte serait à obtenir par filtre CSS, et le rendu des tracés perdrait en qualité. |
| Auto-hébergement des tuiles (Planetiler / OpenMapTiles) | Stockage et bande passante sans rapport avec un plan Vercel Hobby, pour une feature de phase 1. |
| **Appel Overpass depuis le client** | Exposerait sans contrôle une infrastructure bénévole et très sollicitée, sans cache partagé possible, sans limitation de débit, et rendrait la clé de cache dépendante du viewport de chacun. Contrainte explicitement posée par le fondateur. |
| **Une entrée de cache par (tuile × sport)** — forme initiale de cet ADR | Avec un classement par combinaison de tags et un chevauchement voulu, les 4 requêtes ramènent des sous-ensembles largement redondants : plus de charge Overpass pour la même donnée. Et surtout, elle soude extraction et classement, si bien qu'un simple réglage de seuil jetterait toute la donnée brute. Révisée en §4.1. |
| Clé de cache incluant la **combinaison** de sports | Variante encore pire : 15 sous-ensembles non vides pour 4 sports, donc ×15 sur les entrées et sur les manques. |
| Paramètre `sports` filtrant côté serveur | Ferait dépendre les clés N1/N2 du jeu de filtres et rendrait chaque changement de pastille coûteux, pour économiser une bande passante déjà payée au niveau du cache. |
| Classement dans `@hybride/rules-engine` | Le précédent d'ADR-016 §5 est clair : le moteur n'accueille du code applicatif que lorsqu'il doit revérifier des **garde-fous de sécurité**. Classer un sentier n'en est pas un. |
| Cache dans une table Postgres | Contredit frontalement la décision « phase 1 sans écriture en base, sans nouvelle table », et ajouterait un chemin d'écriture à surveiller pour un gain nul par rapport au Data Cache. |
| Redis / Upstash | Aucune infrastructure de ce type dans le projet ; même raisonnement que `fixed-window-limiter.ts` §1. |
| Cache CDN partagé (`s-maxage` sur la route) | Route authentifiée : risque de fuite, et désactivation silencieuse du cache dès que Supabase émet un `Set-Cookie` de rafraîchissement. |
| bbox arrondie à N décimales | L'arrondi conserve la **taille du viewport** dans la clé : deux utilisateurs voisins produisent deux clés différentes, taux de hit quasi nul. |
| Auto-hébergement d'un serveur Overpass | Coût d'exploitation sans commune mesure avec le besoin de la phase 1. Réévaluable si le volume explose. |
| Tuiles vectorielles maison des tracés (pré-calcul) | Suppose un pipeline de génération, du stockage et un cron : la bonne réponse à un problème d'échelle que nous n'avons pas encore. Phase 3. |
| Résoudre le chevauchement en attribuant **un seul** sport par chemin | Contraire à la décision du fondateur, et faux dans le monde réel : un sentier étroit non revêtu *est* à la fois du trail et de la rando. |
| CTA « Utiliser pour ma séance » en phase 1 | Décision du fondateur. Impliquerait une écriture en base, une table, un lien vers `planned_sessions` et donc une interaction avec ADR-004 et ADR-016 — c'est-à-dire une tout autre feature. |
| Réutiliser `--color-success` / `--color-info` / `--color-warning` pour les sports | Casserait la sémantique métier de `docs/design-system.md` §1.4 (**orange = douleur/gêne/alerte**). Décision du fondateur : famille de tokens dédiée. |
| Cinquième item dans la tab bar | Le design system fixe 4 items (§4.9). **Écarté par le fondateur le 2026-09-06**, au même titre que le remplacement d'un item existant : la tab bar reste à 4 et `/carte` s'atteint depuis `/planning` (lot L1). |

---

## Découpage en lots

> Convention du dépôt : lots `L1`, `L2`… tels qu'employés dans `plans/US-02-*.md` §0.3 et `plans/US-03-*.md` §0.3/§6, et repris en en-tête de chaque migration (`-- …, US-03, Lot L1, ADR-016`). **Aucune migration ici** : la phase 1 n'en produit pas, l'en-tête de lot ne s'applique donc à aucun fichier SQL.
>
> Le **plan technique complet** (`plans/US-04-carte-traces-outdoor.md` : composants, tests détaillés, risques numérotés, ordre des étapes) reste à produire **après** la fiche `spec-writer` et les notes `designer`. Il reprendra ce découpage sans le rouvrir.

| Lot | Contenu | Livrable vérifiable | Dépendances |
|---|---|---|---|
| **L1 — Socle carte** | Dépendance `maplibre-gl` ; route `/carte` (Server Component) + `<MapCanvas>` (Client, `next/dynamic` `ssr: false`) ; style `alidade_smooth_dark` via `MAP_TILES_STYLE_URL` ; **attribution ODbL non repliable** ; bouton flottant de recentrage + `navigator.geolocation` (permission refusée = état explicite, jamais un écran vide) ; états `loading` et `zoom_required` ; garde fail-closed `MAP_TILES_PLAN` ; `.env.local.example` ; **point d'entrée : lien vers `/carte` depuis `/planning`** (la tab bar n'est pas touchée — voir §Contexte constat 5) ; `/carte` est un **sous-écran** au sens du patron `Yf6zY` : pas de tab bar, fermeture explicite qui ramène à `/planning` | La carte s'affiche en plein écran au thème sombre, l'attribution est visible sans interaction, **aucune requête réseau ne part vers Overpass** ; **`/carte` est atteignable depuis `/planning` et on en revient** ; `TAB_ITEMS` reste à 4 entrées | Clé Stadia de développement (`devops`) |
| **L2 — Extraction, cache et classement** | `GET /api/v1/map/trails` ; arrondi serveur sur la grille `TILE_ZOOM` ; `unstable_cache` sur les **données brutes** (clé `['overpass', OVERPASS_QUERY_VERSION, tuile]`, `revalidate: 86400`) ; `overpass-client.ts` en `server-only` ; élagage de tags, simplification, `MAX_FEATURES_PER_TILE`, dédoublonnage inter-tuiles ; limiteurs d'entrée et de sortie ; **`classifySports()` pur dans `@hybride/domain`** + `CLASSIFIER_VERSION` ; contrats Zod ; codes `OVERPASS_UNAVAILABLE` / `degraded` / `truncated` | ① deux requêtes sur la même tuile ⟹ **un seul** appel Overpass ; ② **changer `CLASSIFIER_VERSION` ne déclenche aucun appel Overpass** ; ③ aucun module client n'atteint l'URL Overpass ; ④ table de cas du §5.3 couverte, **dont les chevauchements Trail ⊂ Rando et Route ∩ Vélo** | L1 |
| **⛔** | **Point de validation humaine recommandé** — volume réel par tuile, pertinence du classement sur le terrain du fondateur, taux de hit. Juger sur pièces `TILE_ZOOM`, le TTL, les seuils de §5.2 et le périmètre de « Route ». C'est le moment prévu pour se tromper sans coût : le classement se règle sans retoucher le cache. | | |
| **L3 — Rendu, filtres, bottom sheet** | Sources et couches MapLibre par sport ; **filtrage 100 % client** sur `properties.sports` (zéro requête réseau) ; dédoublonnage par `osmId` et **règle de teinte pour un chemin multi-sports** ; 4 pastilles pill (`docs/design-system.md` §4.4) ; tokens `--color-map-route` / `-trail` / `-hike` / `-bike` ; bottom sheet (nom, distance, **dénivelé « — »**, surface — « non renseignée » si `surfaceInferred`) ; états `empty`, `error`, `truncated` ; accessibilité (cibles ≥ 44 px, focus visible, `aria-live`, **alternative clavier au tap sur un tracé**, `prefers-reduced-motion`) | Décocher une pastille filtre les tracés **sans aucune requête réseau** ; un chemin appartenant à deux filtres actifs est dessiné **une seule fois** ; l'état « aucun résultat » est atteignable et lisible | L2 + **`designer`** : teintes des 4 tokens (hors palette sémantique) **et règle de rendu du chevauchement** |
| **L4 — Production (conditionnel, bloquant)** | Souscription **Stadia Starter** ; bascule `MAP_TILES_PLAN=commercial` ; style sombre outdoor personnalisé livré par `designer` et publié ; clé restreinte par domaine + alerte de quota ; **dénivelé réel** via l'Elevation API ; E2E Playwright (attribution, filtres, chevauchement, bottom sheet, `zoom_required`, `empty`, dégradé) ; observabilité (taux de hit N3, requêtes Overpass/jour, volume par tuile) ; DPA + registre des traitements + politique de confidentialité | `MAP_TILES_PLAN=commercial` en production, attribution vérifiée par test, dénivelé renseigné | **Fondateur** (souscription), `designer` (style), `devops` (clé, DPA, registre) |

**Ordre de mise en œuvre** : L1 → L2 → ⛔ → L3 → L4. L1 et L2 sont indépendants de tout travail `designer` ; L3 est bloqué tant que les teintes **et** la règle de chevauchement ne sont pas arbitrées ; **L4 conditionne la mise en production et rien d'autre** — L1 à L3 sont livrables et démontrables sur le palier gratuit, en développement.

---

## Questions ouvertes relayées

1. ~~**Point d'entrée de `/carte`.** La tab bar compte 4 items et le design system en fixe 4 (§4.9). Cinquième item, remplacement, ou entrée depuis `/planning` / le Dashboard ?~~ **Tranché par le fondateur le 2026-09-06** : **lien depuis `/planning`**, la tab bar **reste à 4 items** — ni cinquième item, ni remplacement. Le R7 de l'US-03 est donc levé pour cette feature : le point d'entrée est un livrable vérifiable du lot **L1**. `designer` garde la forme du lien (placement dans `/planning`, libellé, icône) ; il ne peut plus rouvrir le principe. *Reste à `designer` : forme du lien.*

   **Condition de réévaluation posée par le fondateur (même date)** : cette décision vaut **pour la phase 1**. Si « Aujourd'hui » (`/dashboard`) et « Séance » (`/aujourdhui`) **fusionnent**, un item de tab bar se libère et **`/carte` devient le candidat naturel** pour l'occuper. Ce n'est donc pas un choix définitif d'architecture de navigation, mais un placement contraint par la saturation actuelle de la barre — à rouvrir si et seulement si cette fusion a lieu.
2. **Régime d'accès.** Libre, sous quota d'accès libre, ou premium ? La carte ne consomme ni moteur ni donnée de santé, mais **consomme des crédits Stadia à chaque ouverture**. Proposition par défaut : **authentifié, hors quota, non premium**, à l'image de `POST /schedule/incidents`. *Propriétaire : fondateur.*
3. **Teintes des quatre tokens `--color-map-*`, et rendu d'un chemin multi-sports.** Contrainte posée ici (famille dédiée, hors palette sémantique, contraste AA sur `#0A0A0A` **et** sur le fond de carte, jamais la couleur seule comme porteuse d'information). S'y ajoute, depuis la décision sur le chevauchement : **quelle teinte porte un chemin appartenant à deux filtres actifs** (priorité fixe, tracé double, ou style « multi ») ? Les valeurs et la règle ne sont **pas** du ressort d'`architect`. **Bloque L3.** *Propriétaire : `designer`.*
4. **Réglages résiduels du classement.** Le mapping lui-même est **tranché** (§5) et n'est pas rouvert. Sur les trois valeurs de contenu initialement relayées, **deux ont été tranchées par le fondateur le 2026-09-06** :
   - (a) **Ouvert.** Le seuil de largeur de « étroit », posé à **2 m** — valeur proposée, non sourcée. À juger sur pièces au point de validation de fin de L2, modifiable sans coût grâce à `CLASSIFIER_VERSION` (§4.1). *Propriétaires : fondateur + `spec-writer`.*
   - (b) ~~Périmètre de « Route ».~~ **Tranché** : « Route » **exclut la voirie ordinaire** (§5.5) et ne retient que les voies dédiées revêtues. Le fond de carte dessine déjà les rues, et les inclure menacerait la tenabilité de l'extraction unique par tuile. **Limite assumée** : un coureur urbain ne verra aucun tracé surligné là où il court réellement — à réévaluer en phase 2 si l'usage le contredit.
   - (c) ~~Absence du VTT / gravel.~~ **Tranché** : acceptable en phase 1. Conséquence directe de « Vélo = cycleway + revêtu partagé » — un single-track roulant apparaît en Trail/Rando, jamais en Vélo. Trou fonctionnel documenté, à traiter en phase 2 (élargissement de « Vélo » au non-revêtu roulant, ou cinquième filtre VTT).
5. **Faits fournisseurs non vérifiables au 2026-09-06, à confirmer par `devops` à la souscription** : (a) disponibilité des **styles personnalisés** Stadia selon le palier — `docs.stadiamaps.com/themes/custom-styles/` répond **403** à l'outil de récupération, seule la mention d'existence dans `/themes/` a pu être lue ; (b) inclusion de l'**Elevation API** dans le palier Starter — la page tarifaire ne détaille par palier que « Basic APIs only » (gratuit) et le routage (payants) ; (c) existence de **variantes sombres** chez MapTiler, non listées sur `maptiler.com/maps/`. Aucun de ces trois points ne renverse la décision §1, qui repose sur l'absence totale de routage et d'élévation chez MapTiler — fait, lui, vérifié sur les deux pages tarifaire et catalogue.
6. **Dénivelé.** Accepter « — » durablement, ou conditionner l'ouverture au public au lot L4 ? Le coût en crédits d'un profil altimétrique par tracé affiché est à mesurer avant de l'activer sur le chemin chaud. *Propriétaire : fondateur.*
7. **Date de souscription du palier commercial.** C'est le bloquant de mise en production de cette feature, au même rang que le ruleset `1.0.0` l'est pour le produit (ADR-007). *Propriétaire : fondateur.*
