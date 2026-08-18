# Feature 3 — Notes de design (US-03 Planning selon emploi du temps)

> Produit par `designer`, révisé le 2026-08-12 après suppression du zoning `RL7Pe` et réouverture du
> bon fichier Pencil. Sources : `10-spec-feature3-planning-emploi-du-temps.md` (fiche SDD, lecture
> seule) et `docs/design-system.md` (charte v1).
>
> ## ⚠️ Statut : spec écrite de substitution — rien n'a été écrit dans le `.pen`
>
> Le bon document est bien ouvert cette fois (vérifié : `K5Icv3`, `jSZB0`, `MqvfH` se résolvent et
> rendent correctement en thème sombre). **Mais les outils d'écriture Pencil ne sont toujours pas
> disponibles dans ma session** : mon registre d'outils expose uniquement `get_screenshot` et
> `export_nodes`. Les appels `mcp__pencil__get_app_state` et `mcp__pencil__execute` retournent
> `No such tool available` — ce n'est pas un problème de document ouvert, c'est un provisionnement
> d'outils manquant côté agent. Voir §6.
>
> Ce document est donc écrit pour être **implémenté tel quel dans Pencil** par un intervenant
> disposant de `execute`, et il est suffisamment précis pour que `developer` puisse coder sans
> maquette si nécessaire. La lecture (`get_screenshot` / `export_nodes`) a fonctionné : les specs
> ci-dessous sont calées sur le **rendu réel** des écrans F1, pas sur des suppositions.
>
> Aucune décision produit n'est rouverte : les 4 arbitrages du fondateur du 2026-08-11 (§7 de la
> fiche) sont appliqués tels quels.

---

## 0. État réel constaté des écrans de référence (relevé par export 2×)

### `jSZB0` — Dashboard accès libre

Header : tuile logo blanche 40 px (rayon 10) + wordmark `HYBRIDE CLUB` en `--text-label`
`--color-foreground-muted` à gauche ; à droite, puce violette 6 px + `2 / 3 accès cette semaine`.
Puis `MERCREDI 4 AOÛT` (`--text-label` subtle), titre serif `Bonjour Thomas.`, puis les cartes.
Tab bar 4 items : **Aujourd'hui · Séance · Planning · Profil**, item actif violet.

> **Conséquence majeure pour le livrable 1** : « Planning » est un **onglet racine** de la tab bar,
> pas un écran empilé. Voir §1.1.

### `MqvfH` — Séance du jour

Header : tuile logo + `SÉANCE DU JOUR` (`--text-label`) à gauche, `Mer. 4 août`
(`--color-foreground-muted`) à droite. **Aucun bouton retour** — c'est le motif de header canonique
de la charte.

Contenu posé **directement sur `--color-background`** (pas de carte englobante), rythmé par des
labels de section `--text-label`. Méta de séance sur une ligne : `52 min   RPE cible 7   Course`
(`--text-small` `--color-foreground-muted`, gap ~24 px) — **la discipline est un mot, pas une
couleur**.

Bloc « Ce qui change cette semaine » : **grammaire de la valeur qui change**, à réutiliser
telle quelle en F3 —

```
Volume course            42 km  →  38 km      ancienne valeur en gris subtle,
Séances intenses             3  →  2          flèche en gris, NOUVELLE valeur
Glucides jours intenses   300 g →  320 g      en --color-warning (ou --color-success)
```

C'est exactement le motif dont F3 a besoin pour « déplacée de X vers Y ». **J'abandonne donc le
`line-through` que j'avais proposé dans la version précédente de cette note au profit de ce motif
`ancien → nouveau` déjà établi dans les maquettes.**

### `K5Icv3` — carte planning du Dashboard (état actuel exact)

```
PLANNING GLISSANT · J → J+7          ← --text-label, --color-foreground-subtle
JEU   Repos actif — 30 min souple                                  ● (vert)
VEN   Force bas du corps — 5 × 5                                   ● (rose)
SAM   Sortie longue — 1 h 40 en Z2                                 ● (bleu)
┌──────────────────────────────────────────────────────────────┐
│  Vue semaine complète et blocs macro            Abonnés       │  ← bloc verrouillé
└──────────────────────────────────────────────────────────────┘
```

- La carte est un **aperçu glissant J → J+7 sur 3 lignes**, pas une semaine Lun→Dim. Ma version
  précédente supposait à tort une grille hebdomadaire — corrigé ci-dessous.
- Colonne jour : `JEU` / `VEN` / `SAM` en `--text-label`, `--color-foreground-subtle`, largeur ~44 px.
- Intitulé : `--text-body-strong` (15/24) `#FFFFFF`, une ligne.
- **Aucun horaire affiché** → c'est précisément ce que F3 doit ajouter (AC5).
- Puce colorée 8 px à droite = code discipline. **Le rose de la ligne « Force » n'existe pas dans
  `docs/design-system.md`** — écart préexistant, signalé en §5, non propagé au nouvel écran.
- Bloc verrouillé (`R8syr` / `LBMdV`) : fond `--color-surface-raised`, `--radius-md`, texte
  `Vue semaine complète et blocs macro` en `--color-foreground-subtle` + `Abonnés` en
  `--color-accent-text`. **Ne pas modifier.**

---

## 1. Livrable 1 — Écran « Planning semaine » à créer en hi-fi (nouveau frame)

`RL7Pe` (zoning bas-fidélité) ayant été supprimé, l'écran est à concevoir de zéro dans le style des
6 écrans F1. L'architecture d'information du zoning est reprise (header, une ligne par jour
Lun→Dim, bouton « Signaler un imprévu »), le rendu visuel est entièrement recalé sur la charte.

**Frame à créer** : nom `8 — Planning semaine`, largeur **375**, hauteur ~1400 (scroll),
fond `--color-background` `#0A0A0A`, gouttière horizontale **20 px**.

### 1.1 Header — écart assumé vs le zoning

Le zoning prévoyait un **bouton retour**. Je ne le reprends pas : « Planning » est un **onglet
racine** de la tab bar (constaté sur `jSZB0`), et aucun écran F1 hi-fi n'affiche de flèche retour.
Un retour serait incohérent avec le modèle de navigation en place.

→ Header identique à `MqvfH` : tuile logo 40 px + `PLANNING · SEMAINE` (`--text-label`,
`--color-foreground-muted`) à gauche ; à droite `4 – 10 août` (`--text-small`,
`--color-foreground-muted`).

### 1.2 En-tête de contenu

| Élément | Contenu | Style |
| --- | --- | --- |
| Label | `SEMAINE DU 4 AU 10 AOÛT · 6 SÉANCES` | `--text-label`, `--color-foreground-subtle` |
| Titre | `Ta semaine.` | `--text-display` (serif 700, 32/36), `#FFFFFF` |
| Sous-titre | `Placée autour de tes créneaux disponibles.` | `--text-body`, `--color-foreground-muted` |

Espace sous le header : `space-10` (40). Espace titre → première journée : `space-8` (32).

### 1.3 Structure d'une journée

```
┌ groupe jour ─────────────────────────────────────────────┐
│  LUNDI 4                    ← --text-label, subtle       │
│  ┌ carte séance ─────────────────────────────────────┐   │
│  │ fond --color-surface #1A1A1A, --radius-lg 16,     │   │
│  │ padding 20, PAS de bordure, PAS d'ombre           │   │
│  │ liseré gauche 3px --radius-full ← porte l'état    │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

- Gap label jour → carte : `space-3` (12).
- Gap entre deux séances d'un même jour : `space-3` (12).
- Gap entre groupes-jour : `space-6` (24).
- **Jour de repos** : pas de carte. Sous le label du jour, `Repos` en `--text-small`
  `--color-foreground-subtle`. Cohérent avec l'état `empty` de la charte, et ça allège l'écran.
- Marge basse avant la tab bar : `space-12` (48).
- Tab bar en pied, onglet **Planning** actif (violet, `aria-current="page"`).

### 1.4 État (a) — Séance normale

| Zone | Contenu | Style |
| --- | --- | --- |
| Liseré gauche | — | **absent** |
| Ligne 1 | `18h30` | `--text-small` sans **600**, `#FFFFFF` |
| Ligne 2 | `Seuil — 3 × 8 min à allure semi` | `--text-heading` (20/26 sans 600), `#FFFFFF` |
| Ligne 3 (méta) | `52 min    RPE cible 7    Course` | `--text-small` `--color-foreground-muted`, gap horizontal 24 px — **motif repris à l'identique de `MqvfH`** |
| Action | `Signaler un imprévu` | bouton tertiaire, §1.7 |

Gap vertical interne : 8 px, sauf avant l'action : 12 px.

### 1.5 État (b) — Séance replacée suite à un imprévu (AC3)

La carte apparaît **sur le jour de destination**, à son nouvel horaire. **Aucune carte fantôme
n'est laissée sur le jour d'origine** (voir §5, choix assumé).

| Zone | Contenu | Style |
| --- | --- | --- |
| Liseré gauche | — | 3 px `--color-warning` `#F59E0B`, pleine hauteur, `--radius-full` |
| Badge (1re ligne, seul) | `DÉPLACÉE` | pill outline *warning* (charte §4.5) : contour 1 px `#F59E0B`, fond transparent, `--text-label` `#F59E0B`, `--radius-full`, padding 4/10 |
| Ligne 2 | `mar. 18h30  →  jeu. 07h00` | ancien horaire `--text-small` `--color-foreground-subtle` ; flèche `→` `--color-foreground-subtle` ; **nouvel horaire `--text-small` sans 600 `--color-warning` `#F59E0B`** — motif « ancien → nouveau » de `MqvfH` |
| Ligne 3 | `Seuil — 3 × 8 min à allure semi` | `--text-heading` `#FFFFFF` — **strictement inchangé** (AC3 : le contenu ne bouge jamais) |
| Ligne 4 (méta) | `52 min    RPE cible 7    Course` | identique à l'état (a) — **inchangée**, c'est la preuve visuelle que seul le placement a bougé |
| Ligne 5 | `Déplacée suite à un imprévu signalé.` | `--text-small` `--color-foreground-subtle` — le « pourquoi » exigé par AC3 |
| Action | `Signaler un imprévu` | reste **actif** (§5, point 4) |

### 1.6 État (c) — Séance annulée pour la semaine, faute de créneau (AC4)

La carte **reste affichée à sa position d'origine** (jour + horaire initialement prévus) : aucune
disparition silencieuse, exigence explicite de l'AC4.

| Zone | Contenu | Style |
| --- | --- | --- |
| Liseré gauche | — | 3 px `--color-border-strong` `#3A3A3A` — décoratif, voir §5 point 3 |
| Badge (1re ligne) | `ANNULÉE CETTE SEMAINE` | pill outline *warning* : contour 1 px `#F59E0B`, `--text-label` `#F59E0B` |
| Ligne 2 | `mar. 18h30  →  Annulée` | même motif « ancien → nouveau » : horaire d'origine `--color-foreground-subtle`, `Annulée` en `--color-warning` sans 600 |
| Ligne 3 | `Seuil — 3 × 8 min à allure semi` | `--text-heading` **`--color-foreground-muted`** `#A1A1AA` (plus blanc : hors programme). **Jamais d'`opacity`** — la charte l'interdit sur fond noir |
| Ligne 4 (méta) | `52 min    RPE cible 7    Course` | `--color-foreground-subtle` |
| Ligne 5 *(obligatoire)* | `Aucun créneau disponible cette semaine.` | `--text-small` `--color-foreground-subtle` |
| Ligne 6 *(obligatoire)* | `Elle n'est pas reportée à la semaine prochaine.` | `--text-small` `--color-foreground-subtle` |
| Action | — | **le bouton disparaît** (plus rien à replacer). Aucun CTA de remplacement, aucun bouton « reporter » : le report cumulatif est refusé par décision du fondateur |

La ligne 6 est **non négociable** : elle matérialise l'absence de report cumulatif et évite que
Thomas attende un rattrapage qui n'arrivera jamais.

### 1.7 Bouton « Signaler un imprévu » — spécification d'états

Bouton **tertiaire (lien inline)**, jamais un bouton primaire : le primaire pill violet 56 px est
réservé au CTA unique et pleine largeur d'un écran (charte §4.1) ; ici il y a un bouton **par
séance**, jusqu'à 6 sur l'écran.

- Libellé : `Signaler un imprévu`, `--text-small` sans **600**, `--color-accent-text` `#A78BFA`.
- Pas de fond, pas de bordure, aligné à gauche, gap 12 px au-dessus.
- **Zone tactile ≥ 44 px de haut** (padding vertical ≥ 12 px).
- **Aucun champ, aucune modale, aucun formulaire, aucune confirmation** : le clic déclenche
  directement le réajustement (décision du fondateur du 2026-08-11, AC3).

| État | Rendu |
| --- | --- |
| `default` | `#A78BFA` |
| `hover` | `--color-accent-hover` `#B9A3FB` + soulignement |
| `focus-visible` | `outline: 2px solid #A78BFA; outline-offset: 2px` |
| `active` | fond `--color-accent-subtle` `#241E3A`, `--radius-full`, texte **maintenu `#A78BFA`** (ne pas basculer le texte en `#8B5CF6` : 4,1:1, échec AA) |
| `loading` | libellé → `Je cherche un créneau…`, spinner 16 px `#A78BFA`, `aria-busy="true"`, non cliquable |
| `disabled` | `--color-foreground-subtle`, `aria-disabled="true"`, `cursor: not-allowed`. Cas : séance passée, ou déjà annulée |
| `error` technique | la carte garde son état + ligne `--text-small` `--color-danger` `#F87171` : `Le replacement n'a pas pu être calculé. Réessayer.` — **seul** usage du rouge en F3 |

**Retour utilisateur** : pas de toast. La réponse *est* le passage de la carte de l'état (a) vers
(b) ou (c), annoncé en `aria-live="polite"` (`Séance déplacée à jeudi 7 h 00.` /
`Séance annulée cette semaine, aucun créneau disponible.`).

### 1.8 États d'écran

| État | Rendu |
| --- | --- |
| `loading` | squelettes `--color-surface-raised`, `--radius-lg`, 7 groupes-jour, pas de spinner plein écran |
| `empty` (semaine sans séance) | titre serif conservé + `--text-body` `--color-foreground-muted` : `Aucune séance planifiée cette semaine.` |
| `error` | carte `--color-surface`, `--text-label` `--color-danger`, message + bouton secondaire `Réessayer` |
| **non abonné (AC6)** | l'écran est verrouillé en réutilisant **à l'identique** le motif déjà maquetté (`R8syr` / `LBMdV`) : bloc `--color-surface-raised` + `Abonnés` en `--color-accent-text`. Cette fiche ne redéfinit aucune règle de paywall. Le bouton « Signaler un imprévu » de la **séance du jour** reste accessible en accès libre depuis le Dashboard, jamais grisé, jamais compté au quota |

### 1.9 Frame de variantes à produire à côté de l'écran

Un second frame `8b — Planning semaine · états` isolant les 3 cartes côte à côte (a / b / c) + les
7 états du bouton, pour que `developer` lise les états sans devoir imaginer 3 versions de l'écran.

---

## 2. Livrable 2 — Évolution de `K5Icv3` (carte planning du Dashboard)

**Portée strictement limitée à `K5Icv3` et ses descendants** (`TfxC3`, `v1XcA`, `ZbOHq` ;
`R8syr`, `LBMdV`). `D-data-card`, la carte d'invitation « Connexion données » et l'écran Connexion
données ne sont **pas** touchés (autre designer en parallèle).

### 2.1 Principe

La carte reste un **aperçu glissant J → J+7 sur 3 lignes** : on ne la transforme pas en semaine
Lun→Dim, ce serait dupliquer l'écran détaillé. Elle gagne **uniquement** l'horaire et le reflet de
l'état d'imprévu (AC5, source de vérité unique). **Aucun bouton d'action, aucune explication de
motif, aucune mention de non-report** dans l'aperçu.

Le label `PLANNING GLISSANT · J → J+7` et le bloc verrouillé restent inchangés.

### 2.2 Ligne jour — avant / après

```
AVANT   JEU   Repos actif — 30 min souple                          ●
APRÈS   JEU   07h00   Repos actif — 30 min souple                  ●
              └─ nouveau
```

| Colonne | Largeur | Contenu | Style |
| --- | --- | --- | --- |
| Jour | 44 px | `JEU` | `--text-label`, `--color-foreground-subtle` — inchangé |
| **Heure (nouveau)** | 52 px | `07h00` | `--text-small` sans **600**, `#FFFFFF` |
| Intitulé | flex 1 | `Repos actif — 30 min souple` | `--text-body-strong`, `#FFFFFF`, une ligne, ellipsis — inchangé |
| Puce discipline | 8 px | ● | inchangée (voir §5 point 5) |

Gap horizontal 12 px. Hauteur de ligne **≥ 44 px**. Jour de repos : heure = `—`
`--color-foreground-subtle`.

### 2.3 Reflet des états d'imprévu

| État | Rendu dans l'aperçu |
| --- | --- |
| **(b) déplacée** | la ligne apparaît sur le **jour de destination** ; heure **courante** en `--text-small` sans 600 **`--color-warning`** ; badge `DÉPLACÉE` (pill outline warning, `--text-label`) inséré **entre l'intitulé et la puce**. Pas de mention de l'horaire d'origine — réservé à l'écran détaillé |
| **(c) annulée** | la ligne reste sur son jour d'origine ; heure = `—` `--color-foreground-subtle` ; intitulé en `--color-foreground-subtle` ; badge `ANNULÉE` (pill outline warning) |

Si la largeur manque, tronquer **l'intitulé** (ellipsis), jamais le badge : c'est lui qui porte
l'information de manière non chromatique.

### 2.4 Bloc verrouillé `R8syr` / `LBMdV`

**Inchangé.** Sous verrou, ni les horaires ni les états d'imprévu ne sont révélés : le contenu
premium reste premium (AC6). Ne pas laisser fuiter les nouvelles informations horaires dans l'état
verrouillé.

---

## 3. Tokens utilisés — aucun token nouveau

| Rôle en F3 | Token | Valeur |
| --- | --- | --- |
| Fond d'écran | `--color-background` | `#0A0A0A` |
| Carte séance | `--color-surface` | `#1A1A1A` |
| Bloc verrouillé | `--color-surface-raised` | `#262626` |
| Liseré de séance annulée (décoratif) | `--color-border-strong` | `#3A3A3A` |
| Titre de séance | `--color-foreground` | `#FFFFFF` |
| Méta, séance annulée | `--color-foreground-muted` | `#A1A1AA` |
| Explications, horaire d'origine | `--color-foreground-subtle` | `#8B8B94` |
| **Changement / annulation** | `--color-warning` | `#F59E0B` |
| Action « Signaler un imprévu » | `--color-accent-text` | `#A78BFA` |
| Fond pressé de l'action | `--color-accent-subtle` | `#241E3A` |
| Erreur technique uniquement | `--color-danger` | `#F87171` |
| Carte | `--radius-lg` | 16 |
| Badge, liseré, état pressé | `--radius-full` | 9999 |

Typo : `--text-display` (serif 700, titre d'écran uniquement), `--text-heading`, `--text-body`,
`--text-body-strong`, `--text-small`, `--text-label`. Playfair Display n'est utilisé que pour
`Ta semaine.` — jamais sur une carte, un badge, un bouton ou un horaire (règle d'or charte §2.1).

Sémantique respectée : **orange = alerte/attention** (un imprévu est un changement subi),
**violet = action & coach IA**, **rouge = erreur technique seulement**.

---

## 4. Accessibilité

- **Contrastes** sur carte `#1A1A1A` : `#F59E0B` → **8,1:1** ✅ AAA ; `#A78BFA` → **6,4:1** ✅ AAA ;
  `#8B8B94` → **5,2:1** ✅ AA ; `#A1A1AA` → 6,8:1 ✅ AAA ; `#FFFFFF` → 17,3:1 ✅ AAA.
  Liseré orange (non textuel, seuil 3:1) sur `#1A1A1A` → 8,1:1 ✅.
- **La couleur n'est jamais seule porteuse** : badge texte `DÉPLACÉE` / `ANNULÉE CETTE SEMAINE`
  + motif `ancien → nouveau` + phrase explicite. Un deutéranope lit l'état sans la teinte.
- **Sémantique DOM** : `<section>` par jour avec `<h2>` = nom du jour ; les séances d'un jour dans
  une `<ul>`. Chaque carte porte un `aria-label` complet incluant l'état
  (`Jeudi 7 h 00, Seuil 3 × 8 minutes, déplacée depuis mardi 18 h 30 suite à un imprévu`).
- **Bouton** : `aria-label="Signaler un imprévu sur la séance Seuil du mardi 18 h 30"` — le libellé
  visible seul est ambigu quand 6 boutons coexistent.
- **`aria-live="polite"`** sur le résultat du replacement, jamais `assertive` (le coach n'interrompt
  pas — règle transverse de la charte).
- **Focus** `outline: 2px solid #A78BFA; outline-offset: 2px`, ordre DOM = ordre visuel
  (Lundi → Dimanche, puis ordre horaire dans la journée).
- **Cibles tactiles ≥ 44 × 44 px** (bouton de signalement, lignes de l'aperçu Dashboard).
- **`prefers-reduced-motion`** : passage (a) → (b)/(c) sans animation de déplacement, remplacement
  instantané du contenu.

---

## 5. Écarts et choix assumés

1. **Pas de bouton retour dans le header** (le zoning en prévoyait un). « Planning » est un onglet
   racine de la tab bar et aucun écran F1 hi-fi n'affiche de flèche retour. Un retour contredirait
   le modèle de navigation en place. → §1.1.
2. **Pas de carte fantôme sur le jour d'origine** d'une séance déplacée. L'AC3 exige que Thomas voie
   *quelle* séance a bougé et *pourquoi*, pas que l'origine reste occupée ; un fantôme créerait un
   doublon visuel et une ambiguïté sur la source de vérité (AC5). L'origine est portée par le motif
   `mar. 18h30 → jeu. 07h00`.
3. **`line-through` abandonné** au profit du motif `ancien → nouveau` relevé sur `MqvfH` (« Ce qui
   change cette semaine »). Meilleure cohérence, et le barré est un signal faible en accessibilité.
   Le liseré neutre `#3A3A3A` de l'état (c) est à 1,3:1 sur `#1A1A1A`, sous le seuil 3:1 : il est
   déclaré **décoratif**, aucune information n'y repose. Alternative si un contraste réel est
   souhaité : le supprimer.
4. **Orange et non rouge pour « annulée »** : une séance annulée faute de créneau n'est pas une
   erreur mais une alerte d'adhérence. `--color-danger` reste réservé aux erreurs de formulaire et
   au retrait de consentement (charte §1.4) ; seul l'échec **technique** du calcul utilise le rouge.
5. **Écart préexistant non corrigé** : la puce rose de la ligne « Force bas du corps » dans `K5Icv3`
   ne correspond à aucun token de `docs/design-system.md`. Hors de ma portée (élément existant de
   F1), signalé ici pour arbitrage. Je ne propage pas ce code couleur discipline dans le nouvel
   écran : j'y utilise le **mot** de la discipline dans la ligne de méta (`Course`), motif déjà
   établi sur `MqvfH`.
6. **Le bouton de signalement reste actif sur une séance déjà déplacée.** Aucun garde-fou de
   fréquence n'est tranché (question ouverte §7 de la fiche). L'état `disabled` du §1.7 est déjà
   spécifié pour l'accueillir si le fondateur décide d'un plafond.
7. **Pas de fonction « annuler mon signalement » (undo)** : non prévue par la fiche, non inventée.
   À poser comme question produit si le besoin remonte.
8. **Aucun token nouveau** : pas de nouvelle couleur, pas de nouvelle police, pas de nouveau rayon.

---

## 6. Limites de session et travail restant dans Pencil

### Ce qui a fonctionné / ce qui a bloqué

| Outil | Disponible | Résultat |
| --- | --- | --- |
| `get_screenshot` | ✅ | `K5Icv3`, `jSZB0` OK — bon document confirmé, thème sombre |
| `export_nodes` | ✅ | exports 2× de `jSZB0`, `K5Icv3`, `MqvfH` exploités pour caler cette spec |
| `get_app_state` | ❌ | `No such tool available` |
| `execute` | ❌ | `No such tool available` |
| `export_html` | ❌ | non exposé |

Le problème n'est plus le document ouvert (corrigé) mais le **provisionnement d'outils de ma
session** : sans `execute`, aucune écriture n'est possible. `RL7Pe` est bien introuvable
désormais — cohérent avec sa suppression. La convention `placeholder: true` n'a pas pu être
appliquée, faute d'écriture.

### À créer dans Pencil

**Nouveaux frames :**

| Frame | Contenu |
| --- | --- |
| `8 — Planning semaine` | écran complet, 375 de large, §1.1 → §1.8 |
| `8b — Planning semaine · états` | les 3 cartes séance côte à côte + les 7 états du bouton, §1.9 |

**Nœuds internes suggérés :**
`P-header`, `P-week-title`, `P-day-group` (× 7), `P-session-card--default` (§1.4),
`P-session-card--moved` (§1.5), `P-session-card--cancelled` (§1.6), `P-badge--moved`,
`P-badge--cancelled`, `P-btn-report-incident` (+ ses 7 états), `P-tabbar` (réutiliser celle de
`jSZB0`, onglet Planning actif), `P-paywall-lock` (réutiliser le motif `R8syr`/`LBMdV`).

**Modifications sur `K5Icv3` (portée limitée à ce sous-arbre) :**

| Nœud | Action |
| --- | --- |
| `TfxC3`, `v1XcA`, `ZbOHq` | insérer la colonne **heure** (52 px) entre le jour et l'intitulé, §2.2 |
| `D-planning-day--moved` (à créer) | variante ligne déplacée, §2.3 |
| `D-planning-day--cancelled` (à créer) | variante ligne annulée, §2.3 |
| `R8syr`, `LBMdV` | **ne pas modifier**, §2.4 |

**Ne pas toucher** : `D-data-card`, la carte d'invitation « Connexion données », l'écran Connexion
données (autre designer en parallèle).

---

## 7. Sources

- `10-spec-feature3-planning-emploi-du-temps.md` — AC3 (imprévu et replacement), AC4 (aucune séance
  perdue silencieusement), AC5 (cohérence Dashboard ↔ Planning semaine), AC6 (paywall hérité, accès
  libre au signalement), §7 (décisions tranchées le 2026-08-11).
- `docs/design-system.md` — §1 couleurs, §2 typographie, §3 espacements/rayons, §4.2 bouton
  tertiaire, §4.5 badges/pills, §4.9 tab bar, §4.11 états d'écran, §5 accessibilité.
- Exports 2× relevés le 2026-08-12 : `jSZB0` (Dashboard), `K5Icv3` (carte planning), `MqvfH`
  (Séance du jour — motifs header, méta de séance, « ancien → nouveau »).
