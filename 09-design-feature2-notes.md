# US-02 — Notes de design (Feature 2 · Centralisation des données + Score hybride)

> Rédigé par `designer` le 2026-08-11, **révisé le 2026-08-12** après réouverture du bon fichier
> Pencil et suppression du zoning `SHS0X`.
>
> **Statut : spec écrite de substitution — rien n'a pu être écrit dans Pencil.** Voir §0.
>
> Entrées : `09-spec-feature2-centralisation-donnees.md` (lecture seule), `docs/design-system.md`
> (charte v1, thème sombre unique), et **relevé visuel direct des écrans F1** `jSZB0`, `MqvfH`,
> `Yf6zY` (exports 3×, 2026-08-12).
>
> Destinataire : le prochain intervenant disposant de `execute` sur Pencil, qui peut implémenter ce
> document tel quel. `developer` peut aussi coder directement à partir d'ici : toutes les valeurs
> sont des tokens de `docs/design-system.md`.

---

## 0. État de l'accès Pencil — lecture OK, écriture toujours impossible

La réouverture du bon projet a **résolu la lecture** : `jSZB0`, `MqvfH`, `Yf6zY` sont désormais
accessibles et ont été inspectés en export 3×. Ce document est donc calé sur le **rendu réel**, plus
sur des hypothèses.

En revanche, **`get_app_state` et `execute` ne sont pas enregistrés dans le registre d'outils de ma
session** :

```
mcp__pencil__get_app_state → Error: No such tool available
mcp__pencil__execute       → Error: No such tool available
```

Seuls `get_screenshot` et `export_nodes` m'ont été provisionnés au démarrage de la session, et ce
registre est figé pour toute sa durée — le problème n'était donc pas uniquement le projet ouvert.
**Aucune création ni modification de nœud n'est possible depuis cette session.**

→ **Action pour le prochain intervenant** : ouvrir une session disposant d'`execute`, appeler
`get_app_state({include_schema:true, include_canvas_design:true, include_scripts_and_shaders:false,
include_browser:false})`, puis implémenter les §1 à §4 ci-dessous.

Conventions d'implémentation :

- `placeholder: true` sur tout frame nouveau tant qu'il n'est pas fini, retiré une fois terminé ;
- **ne pas toucher à `D-planning-card` ni à l'écran Planning semaine** (autre designer en parallèle) ;
- sur le Dashboard, n'ajouter que ce qui est décrit ici, ne rien déplacer d'autre ;
- placer les nouveaux frames via `FindEmptySpace`, dans une section nommée
  **« F2 · Centralisation des données »**.

---

## 0.bis Relevé de l'existant (source de vérité visuelle)

Constats tirés des exports, qui **corrigent plusieurs hypothèses de la première version de cette note** :

**Dashboard `jSZB0`** (375 × 1040, scrollable) — ordre réel des blocs :
header → `MERCREDI 4 AOÛT` → `Bonjour Thomas.` → carte **Plan du jour** → carte **Nutrition du
jour** → carte **Mes données** → tab bar.

Header : tuile logo blanche 40 × 40 (rayon 10) + `HYBRIDE CLUB` en `--text-label` ; à droite,
pastille violette 6 px + `2 / 3 accès cette semaine`.

Structure réelle d'une cellule de `D-data-card` — **la valeur est AU-DESSUS du label** :

```
412 UA                     ← --text-metric 22/26 sans 700, #FFFFFF
Charge · +8 % vs S-1       ← --text-small 13/18, coloré : #60A5FA
```

Les 4 cellules : `412 UA` / `Charge · +8 % vs S-1` (bleu) — `68 %` / `Récupération · stable` (vert) —
`7 h 05` / `Sommeil moyen · déclaratif` (**gris**) — `48 bpm` / `FC repos · −2 bpm` (vert).

Deux conséquences majeures :

1. **La provenance est déjà exprimée textuellement** dans le design existant
   (« Sommeil moyen · **déclaratif** », en gris). L'évolution AC6 doit **étendre cette convention
   maison**, pas en inventer une autre.
2. **Une pastille bleue « connecté » est à proscrire** : le bleu `#60A5FA` est déjà la couleur de la
   ligne « Charge ». Une pastille bleue devant une ligne bleue serait illisible sémantiquement.
   → la première version de cette note est corrigée sur ce point (voir §2.2).

`D-data-card` se termine par un **bloc imbriqué existant** (fond `#262626`, rayon 12) : pastille
orange 6 px + « Calibration en cours — 2 semaines sur 4. Je n'ai pas encore assez de recul pour poser
un diagnostic de progression fiable. » — **à ne pas modifier**.

Tab bar : `Aujourd'hui` (actif, violet) · `Séance` · `Planning` · `Profil`.
→ **L'écran « Compte » du livrable 1 est l'onglet « Profil »**, qui **n'a aucun frame** parmi les
écrans F1 existants. Il faut donc créer un frame partiel (§1.2).

**Écran `MqvfH`** — header : tuile logo + `SÉANCE DU JOUR` + méta à droite `Mer. 4 août`.
Les groupes sont introduits par un `--text-label` gris **posé directement sur le fond**, hors carte
(`TES 4 SIGNAUX ENTRAÎNEMENT · 30 SECONDES`).

**Écran `Yf6zY`** — header : tuile logo + `ABONNEMENT HYBRIDE` + **`✕` 24 px à droite**, et
**pas de tab bar** (sous-écran). CTA pill violet pleine largeur, puis lien secondaire centré gris
(« Continuer en accès libre »), puis mention légale en `--text-caption`.
→ C'est le **patron canonique du sous-écran**, à réutiliser tel quel pour Connexion données (§3).

---

## 1. Livrable 1 — Points d'entrée vers « Connexion données » (AC1)

### 1.1 Carte d'invitation sur le Dashboard — `D-connect-invite`

**Placement.** Dans `jSZB0`, **entre la carte « Nutrition du jour » et la carte « Mes données »**.
Gap `space-4` (16) de part et d'autre. Cette position préserve la priorité éditoriale du plan du jour
(Feature 1 §6) et introduit la section données.

**Boîte.** 335 × ≈ 140, fond `--color-surface` `#1A1A1A`, `--radius-lg` 16, padding 20,
pas de bordure ni d'ombre, gap vertical interne 12.

| Nœud | Contenu | Token |
| --- | --- | --- |
| `D-connect-invite-label` | `SYNCHRONISATION` | `--text-label` 11/14 0.14em sans 600, `--color-foreground-subtle` `#8B8B94` |
| `D-connect-invite-title` | « Tes données, au même endroit. » | `--text-heading` 20/26 **sans 600**, `#FFFFFF` |
| `D-connect-invite-body` | « Strava, ta muscu, ta nutrition — connecte ou déclare tes sources, je m'occupe du reste. » | `--text-body` 15/24 sans 400, `--color-foreground-muted` `#A1A1AA` |
| `D-connect-invite-cta` | « Connecter mes sources → » | `--text-body-strong` 15/24 sans 600, `--color-accent-text` `#A78BFA`, cible ≥ 44 px |

**Pas de pill violet ici** : le CTA plein violet est déjà pris par « Voir ma séance du jour » sur ce
même écran. Un second pill créerait une concurrence visuelle et rendrait l'invitation intrusive, ce
qu'AC1 interdit. Le lien inline accent est le pattern « En savoir plus → » déjà présent dans `jSZB0`.

**Titre en sans, pas en serif** : le serif porte la voix éditoriale du coach (« Bonjour Thomas. ») ;
cette carte est un utilitaire de configuration.

**Règle d'affichage (AC1).** Rendue uniquement si `athlete_profiles.data_regime === 'cold'` (aucune
`data_connections` active **et** aucune donnée `data_source='declared'`). Dès la première source
connectée ou déclarée, la carte disparaît **définitivement** ; l'accès permanent vit dans Profil.

**Masquage manuel — proposé, à trancher (§6, écart 3)** : `✕` 24 px `--color-foreground-subtle`
en haut à droite, cible 44 × 44, `aria-label="Masquer cette invitation"`, masquage 7 jours.
Non requis par la fiche — supprimer `D-connect-invite-dismiss` si non retenu.

**États** : default ; hover CTA → libellé souligné, couleur inchangée ; focus-visible →
`outline 2px #A78BFA, offset 2` ; active → soulignement seul (**ne pas passer le texte en
`#8B5CF6`** : 4,1:1 sur `#1A1A1A`, échec AA) ; masquée → carte non rendue, le gap se referme.

### 1.2 Entrée permanente dans Profil — frame `F2-profil-extrait`

L'onglet Profil n'ayant aucun frame, créer un frame **partiel** 375 × 420, nommé
**« F2 · Profil (extrait — section Données) »**, `placeholder: true` jusqu'à validation. Il ne
prétend pas définir tout l'écran Profil : il pose uniquement le point d'entrée demandé.

- Header identique aux autres écrans : tuile logo 40 × 40 rayon 10 + `PROFIL` en `--text-label`
  `--color-foreground-muted`, fond `--color-surface-sunken` `#141414`, hauteur 56.
- `space-8` (32), puis label de section **posé sur le fond** (patron `MqvfH`) :
  `DONNÉES` — `--text-label`, `--color-foreground-subtle`. Gap 12.
- Carte-liste `A-section-data` : 335, fond `--color-surface` `#1A1A1A`, `--radius-lg` 16,
  padding vertical 4, sans bordure ni ombre.
- Ligne `A-data-sources-row` : hauteur 56, padding horizontal 20, en ligne, centrée verticalement :
  - « Sources de données » — `--text-body` 15/24, `#FFFFFF` ;
  - valeur poussée à droite — `--text-small` 13/18, `--color-foreground-muted` :
    `« Aucune »` / `« 1 connectée »` / `« 2 connectées · 1 déclarée »` ;
  - chevron `›` 20 px `--color-foreground-subtle`, gap 8.
- Séparateur 1 px `--color-border` `#262626` entre lignes d'un même groupe, **jamais** sous la
  dernière.

Ligne **toujours visible**, quel que soit le régime de données (AC1 : accès permanent). Elle route
vers `F2-connexion-donnees` (§3), qui porte aussi la déconnexion d'une source (AC10).

**États** : hover → fond de ligne `--color-surface-raised` `#262626` ; focus-visible → anneau 2 px
`#A78BFA` en inset (offset −2 pour ne pas déborder du rayon de la carte) ; active → `#262626`.

---

## 2. Livrable 2 — Dashboard, vue centralisée multi-sources (AC6)

**Périmètre strict : `D-data-card`, `D-data-row1`, `D-data-row2` et leurs cellules.**
Ni `D-planning-card`, ni aucune autre zone.

Principe AC6 : *l'origine reste identifiable sans complexifier la lecture par défaut.* La carte
existante impose deux contraintes (voir §0.bis) : la ligne de label est **déjà colorée par sémantique
métier**, et la provenance y est **déjà écrite en toutes lettres** pour le sommeil.

### 2.1 En-tête de carte

Le label `MES DONNÉES · 7 DERNIERS JOURS` reste inchangé.

1. **Ajout** d'un lien aligné à droite sur la ligne du label : `D-data-detail-link` — « Détail → »,
   `--text-body-strong` 15/24, `--color-accent-text` `#A78BFA`, cible ≥ 44 px. Ouvre le détail par
   source (écran non maquetté ici, §6 écart 5).
2. **Ajout** d'une sous-ligne sous le label, gap 4 : `D-data-sources-summary` — `--text-small` 13/18,
   `--color-foreground-muted`. Contenu : connecté → « 3 sources · Strava, muscu, nutrition » ;
   déclaré seul → « Saisie manuelle » ; froid → sous-ligne absente.
   Gap 16 avant `D-data-row1`.

### 2.2 Cellules — marqueur de provenance (approche révisée)

Les 4 cellules **conservent leur valeur, leur typo et la grille** (2 colonnes, gap 16 h / 20 v,
cellule ≈ 139-140, valeur au-dessus du label).

Modification unique : un **glyphe de provenance monochrome 12 px**, en
`--color-foreground-subtle` `#8B8B94`, ajouté **en fin de ligne de label**, gap 4 :

| Provenance | Glyphe | Signification |
| --- | --- | --- |
| Connecté (synchronisé d'une source tierce) | `↻` | synchronisé automatiquement |
| Déclaré (saisi manuellement) | `✎` | saisi par Thomas |
| Mixte sur la période | `↻✎` accolés, gap 2 | les deux |

**Pourquoi un glyphe gris et pas une pastille colorée** : la ligne de label porte déjà la couleur
métier (bleu = charge, vert = récupération). Une pastille bleue « connecté » entrerait en collision
directe avec la ligne « Charge » bleue. Le glyphe est monochrome, neutre, et **n'entre en conflit
avec aucune sémantique de couleur existante**.

**Conséquence sur la cellule Sommeil** : le suffixe textuel `· déclaratif` est remplacé par le
glyphe `✎`, pour homogénéiser les 4 cellules (« Sommeil moyen ✎ »). C'est la seule modification de
contenu existant, et elle est dans le périmètre autorisé.

La ligne de label reste : `Label · delta`, `--text-small`, couleur métier, **avec le signe explicite**
(`+8 %`, `−2 bpm`).

### 2.3 Légende — `D-data-legend`

Après `D-data-row2` : séparateur 1 px `--color-border` `#262626`, largeur intérieure 295, marge
haute 16 ; puis gap 12, une ligne horizontale, gap 16 entre items :

`↻ Synchronisé` — `↻` 12 px + libellé `--text-caption` 12/16 `--color-foreground-muted`
`✎ Déclaré` — idem

C'est cette légende qui donne le sens du glyphe **une seule fois**, en 12 px, hors du chemin de
lecture principal (valeurs → labels). Elle satisfait aussi la règle « la couleur/le symbole n'est
jamais seul porteur d'information ».

### 2.4 Ordre final des enfants de `D-data-card`

```
label + Détail →           (modifié)
D-data-sources-summary     (nouveau)
D-data-row1                (glyphes ajoutés)
D-data-row2                (glyphes ajoutés, "déclaratif" → ✎)
D-data-legend              (nouveau)
[bloc calibration orange]  (EXISTANT — ne pas toucher)
D-data-score-row           (nouveau)
```

### 2.5 Accès au Score hybride — `D-data-score-row`

Dernier enfant de `D-data-card`, gap 16 sous le bloc de calibration existant. Point d'entrée de
l'écran du livrable 4 depuis le Dashboard.

Bloc imbriqué 295 × 56, fond `--color-surface-raised` `#262626`, `--radius-md` 12, padding
horizontal 16, en ligne, gap 12, centré — **même famille visuelle que le bloc de calibration
juste au-dessus**.

- **Mini-anneau** 28 × 28, épaisseur 4, piste `--color-border-strong` `#3A3A3A`, remplissage
  `--color-accent` `#A78BFA` proportionnel, départ −90°, extrémités arrondies.
- **Libellé** « Score hybride » — `--text-body` 15/24, `#FFFFFF`.
- **Valeur** poussée à droite — `--text-body-strong` : score disponible → `72` en
  `--color-accent-text` `#A78BFA` ; calibration → « Calibration » en `--color-warning` `#F59E0B`,
  mini-anneau réduit à sa seule piste `#3A3A3A`.
- **Chevron** `›` 20 px `--color-foreground-subtle`, gap 8.

### 2.6 États de `D-data-card`

| État | Rendu |
| --- | --- |
| default | tel que décrit |
| loading | squelettes `--color-surface-raised` `--radius-md` aux dimensions des 4 valeurs + score-row ; pas de spinner plein écran |
| empty (régime froid) | les 4 valeurs affichent `—` en `--text-metric` `--color-foreground-subtle`, pas de glyphe, pas de légende, pas de sous-ligne ; score-row en « Calibration ». `D-connect-invite` est alors visible juste au-dessus et porte l'action |
| partiel (une seule source) | un seul glyphe, sous-ligne « Saisie manuelle » ou « Strava », légende réduite au type présent |
| error (sync en échec) | **conserver les dernières valeurs** ; ajouter sous la légende un `--text-label` `--color-danger` `#F87171` « SYNCHRONISATION EN ÉCHEC » + lien secondaire « Réessayer ». Ne jamais vider la carte |
| source déconnectée (AC10) | les données conservées passent en glyphe `✎` ; aucun recalcul à la baisse, aucune alerte sur le Dashboard |

---

## 3. Livrable 3 — Écran « Connexion données » hi-fi, à créer de zéro

Le zoning `SHS0X` a été supprimé : **aucune maquette n'existe**. L'architecture d'information du
zoning est reprise (header + une carte par source avec bouton « Connecter » + « Saisir
manuellement » + CTA « Continuer » en pied), le rendu est entièrement nouveau, calé sur le patron de
sous-écran `Yf6zY`.

**Frame `F2-connexion-donnees`**, 375 × ≈ 1140 (scrollable, comme `jSZB0` 1040 et `MqvfH` 1400),
fond `--color-background` `#0A0A0A`, gouttières 20 → colonne 335. **Pas de tab bar** (sous-écran,
patron `Yf6zY`).

### 3.1 Header

Hauteur 56, fond `--color-surface-sunken` `#141414` :
tuile logo blanche 40 × 40 rayon 10 (composant `LogoHybride` `SHhZ3`) + gap 16 +
`CONNEXION DONNÉES` en `--text-label` `--color-foreground-muted` ; à droite, `✕` 24 px
`--color-foreground-muted`, cible 44 × 44, `aria-label="Fermer"`.

C'est exactement le header de `Yf6zY` — le `✕` est le retour attendu pour un sous-écran ; on
n'introduit pas de chevron de retour, absent de toute la charte.

### 3.2 En-tête éditorial

```
space-8 (32)
MES SOURCES DE DONNÉES        --text-label, --color-foreground-subtle
space-2 (8)
Tes données, réunies.         --text-display 32/36 serif 700, #FFFFFF
space-3 (12)
« Connecte ce qui peut l'être, déclare le reste. Rien n'est obligatoire :
  ton plan du jour fonctionne déjà sans. »
                              --text-body 15/24, --color-foreground-muted
space-6 (24)
```

La dernière phrase porte visuellement l'AC9 dès le premier écran : la connexion enrichit, elle ne
conditionne jamais.

### 3.3 Cartes de source — patron commun

Trois cartes, gap 16, largeur 335, fond `--color-surface` `#1A1A1A`, `--radius-lg` 16, padding 20,
gap vertical interne 12, sans bordure ni ombre.

```
┌──────────────────────────────────────────┐
│ Strava                    [NON CONNECTÉ] │  ligne 1
│ Course, vélo, natation — synchro auto.   │  ligne 2
│ ┌──────────────────────────────────────┐ │
│ │            Connecter                 │ │  bouton ghost 295 × 44
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

- **Nom de source** — `--text-heading` 20/26 sans 600, `#FFFFFF`.
- **Badge d'état**, aligné à droite sur la même ligne — pill outline 1 px, `--radius-full`,
  padding 4 / 10, `--text-label` 11/14 de la même couleur que le contour (charte §4.5) :

| État | Libellé | Contour + texte |
| --- | --- | --- |
| non connecté | `NON CONNECTÉ` | `--color-border-strong` `#3A3A3A` / `--color-foreground-subtle` `#8B8B94` |
| connecté | `CONNECTÉ` | `--color-success` `#4ADE80` |
| sans intégration V1 | `SAISIE MANUELLE` | `--color-border-strong` / `--color-foreground-subtle` |
| erreur d'autorisation | `RECONNEXION REQUISE` | `--color-warning` `#F59E0B` |

- **Description** — `--text-small` 13/18, `--color-foreground-muted`, 2 lignes max.
- **Bouton ghost** pleine largeur intérieure 295, hauteur 44, `--radius-full`, fond
  `--color-surface-raised` `#262626`, libellé `--text-button` 16/20 sans 600,
  `--color-foreground-muted` au repos → `#FFFFFF` au survol (charte §4.2, « ghost/chip neutre »).
  Volontairement **pas un pill violet** : le violet est réservé au CTA unique « Continuer » du pied
  d'écran ; trois pills violets empileraient trois actions primaires concurrentes.

### 3.4 Contenu des trois cartes

| Nœud | Nom | Badge | Description | Bouton |
| --- | --- | --- | --- | --- |
| `C-source-strava` | Strava | `NON CONNECTÉ` | « Course, vélo, natation — synchronisation automatique de tes sorties. » | « Connecter » → flux OAuth (AC2) |
| `C-source-muscu` | Musculation | `SAISIE MANUELLE` | « Pas d'intégration en V1 — enregistre tes séances depuis Séance du jour. » | « Saisir manuellement » → `MqvfH` |
| `C-source-nutrition` | Nutrition | `SAISIE MANUELLE` | « Tes 2 signaux nutrition suffisent : aucun carnet alimentaire à remplir. » | « Saisir manuellement » → `MqvfH` |

**Variante `C-source-strava` à l'état connecté** : badge `CONNECTÉ` vert ; une ligne méta apparaît
sous la description — `↻ Dernière synchro · il y a 12 min`, `--text-small`
`--color-foreground-subtle` ; le bouton ghost devient « Déconnecter ».

### 3.5 Bloc « pourquoi c'est facultatif » — `C-optional-block`

Après les trois cartes, gap 16. Bloc imbriqué, largeur 335, fond `--color-surface-raised` `#262626`,
`--radius-md` 12, padding 16, gap 8 — **même patron que « POURQUOI CETTE SÉANCE »** dans `jSZB0` :

- label `POURQUOI C'EST FACULTATIF` — `--text-label`, `--color-accent-text` `#A78BFA` (violet : c'est
  une prise de parole du coach) ;
- corps `--text-body` 15/24 `--color-foreground-muted` : « Le coach construit déjà ton plan à partir
  de ce que tu déclares. Une source connectée affine l'ajustement — elle ne le conditionne jamais. »

### 3.6 Pied d'écran

```
space-6 (24)
[ Continuer ]                  pill 335 × 56, --color-accent #A78BFA,
                               texte --color-foreground-on-accent #0A0A0A,
                               --text-button 16/20, --radius-full
space-3 (12)
Plus tard                      lien secondaire centré, --text-button,
                               --color-foreground-muted → #FFFFFF au survol
space-4 (16)
« Tu peux connecter ou retirer une source à tout moment depuis ton profil. »
                               --text-caption 12/16, --color-foreground-subtle, centré
space-12 (48)
```

Patron strictement identique au pied de `Yf6zY` (pill → lien gris centré → mention caption).
La mention finale porte l'AC1 (accès permanent) et l'AC10 (retrait possible).

### 3.7 Feuille de déconnexion — `C-disconnect-sheet` (AC10)

Frame secondaire 375 × 320, à poser à droite de `F2-connexion-donnees`, gap 40. Feuille ancrée en
bas, fond `--color-surface` `#1A1A1A`, rayon supérieur 20 (`--radius-xl`), padding 20, gap 16 :

- titre `Déconnecter Strava ?` — `--text-title` 24/30 **serif 700**, `#FFFFFF` ;
- corps `--text-body` `--color-foreground-muted` : « Tes séances déjà importées restent dans ton
  historique, elles basculent simplement en saisie déclarée. Seule la synchronisation s'arrête. » ;
- CTA pill violet 295 × 56 « Déconnecter » ;
- lien secondaire centré « Annuler » — `--text-button` `--color-foreground-muted`.

Le CTA reste **violet et non rouge** : conformément à AC10 tranché le 2026-08-11, l'action n'est pas
destructive (aucune donnée perdue). Utiliser `--color-danger` ici mentirait sur la conséquence.
La feuille piège le focus et se ferme à `Échap`.

### 3.8 États de l'écran Connexion données

| État | Rendu |
| --- | --- |
| default | 3 cartes, aucune connectée |
| connexion en cours | bouton ghost en `loading` : spinner 16 px `--color-foreground-muted`, libellé « Connexion… », `aria-busy="true"`, bouton non cliquable ; les autres cartes restent actives |
| connecté | badge vert, ligne « Dernière synchro », bouton « Déconnecter » |
| erreur OAuth | badge `RECONNEXION REQUISE` orange + message `--text-small` `--color-warning` sous la description (« Autorisation expirée ou refusée. ») + bouton ghost « Réessayer ». **Jamais de blocage de l'écran** |
| première synchro en cours | badge vert + ligne `↻ Import en cours…` en `--color-foreground-subtle`, `aria-live="polite"` |
| hover / focus / active / disabled | charte §4.1 et §4.2 sans dérogation ; focus-visible `outline 2px #A78BFA offset 2` |

**Consentement RGPD** : la fiche laisse ouverte (§7) la question d'un consentement dédié aux données
importées (FC, sommeil). S'il est requis, il s'insère **dans le flux OAuth**, en réutilisant l'écran
de consentement santé existant `qFZLF` — non maquetté ici (§6, écart 6).

---

## 4. Livrable 4 — Écran « Score hybride » (AC7, AC8, AC9)

**Frame `F2-score-hybride`**, 375 × ≈ 1240 (scrollable), fond `--color-background` `#0A0A0A`,
gouttières 20 → colonne 335. Deux frames côte à côte, gap 80 :
`F2-score-hybride` (nominal) et `F2-score-hybride--calibration` (AC8).

### 4.1 Structure de l'état nominal

```
┌─ header ────────────────────────────────────┐  h 56, --color-surface-sunken #141414
│  [logo]  SCORE HYBRIDE                   ✕  │  patron Yf6zY
└─────────────────────────────────────────────┘
   space-10 (40)
   INTELLIGENCE PERFORMANCE      --text-label, --color-accent-text #A78BFA
   space-2 (8)
   Ton Score.                    --text-display 32/36 serif 700, #FFFFFF
   space-6 (24)
   ┌─ S-score-card ────────────── 335 × 320 ──┐
   ┌─ S-volume-card ───────────── 335 × 232 ──┐   gap 16
   ┌─ S-split-card ────────────── 335 × 176 ──┐
   ┌─ S-context-card ──────────── 335 × 168 ──┐
   space-12 (48)
```

`Ton Score.` est **serif** : prise de parole éditoriale du coach, comme « Bonjour Thomas. » ou
« Ce qui change cette semaine. ». Le point final fait partie de la signature typographique.

**Tab bar** : l'écran est atteint depuis `D-data-score-row` (Dashboard). Le traiter en **sous-écran
sans tab bar**, avec `✕` de fermeture (patron `Yf6zY`) — cohérent avec Connexion données.

### 4.2 `S-score-card` — carte principale à anneau

Fond `--color-surface` `#1A1A1A`, `--radius-lg` 16, padding 20, contenu centré, gap 16.

**Anneau `S-score-ring`** — 180 × 180 :

- piste : cercle complet, épaisseur 12, `--color-border-strong` `#3A3A3A` ;
- remplissage : arc `--color-accent` `#A78BFA`, épaisseur 12, extrémités arrondies, départ −90°
  (12 h), sens horaire ;
- géométrie : rayon 84, circonférence ≈ 527,8 → pour 72 / 100, `dasharray 380 / 148` ;
- **violet plat, aucun dégradé** (la charte l'impose) ;
- centre : `72` en sans **700, 48 / 52**, `#FFFFFF` (extension d'échelle, §6 écart 2) ;
  dessous `/ 100` en `--text-small` `--color-foreground-subtle` ;
  puis `SCORE HYBRIDE` en `--text-label` `--color-foreground-subtle`.

**`S-score-delta`** sous l'anneau : `↑ +4 vs semaine dernière` — `--text-small`,
`--color-success` `#4ADE80`. En baisse : `↓ −3 vs semaine dernière` en `--color-warning` `#F59E0B` —
**jamais `--color-danger`** : la charte interdit le rouge/vert « bon-mauvais » sur des signaux
physiologiques. Signe **et** flèche obligatoires : la couleur ne porte jamais seule l'information.

**`S-score-basis`** : « Basé sur 6 séances · 3 disciplines · 7 derniers jours. » — `--text-body`
`--color-foreground-muted`, centré, 2 lignes max.

### 4.3 `S-volume-card` — volume hebdo par jour

Fond `--color-surface`, `--radius-lg` 16, padding 20, gap 16.

- `VOLUME HEBDO · 7 DERNIERS JOURS` — `--text-label`, `--color-foreground-subtle` ;
- ligne suivante : `412 UA` (`--text-metric` 22/26 sans 700, `#FFFFFF`) et, à droite sur la même
  ligne de base, `+8 % vs S-1` (`--text-small`, `--color-info` `#60A5FA` — bleu = charge, sémantique
  métier reprise à l'identique du Dashboard).

**`S-volume-bars`** — 7 colonnes Lun → Dim, zone 295 × 96 :

- barre 28 de large, gap 16 (7 × 28 + 6 × 16 = 292, centré dans 295) ;
- **piste** 28 × 96, `--radius-full`, `--color-surface-raised` `#262626` — toujours rendue, même un
  jour sans séance ;
- **remplissage** 28 × h, `--radius-full`, `--color-accent` `#A78BFA`, ancré en bas,
  `h = 96 × valeur / max_semaine`, hauteur minimale 4 px dès que valeur > 0 ;
- **jour courant** marqué deux fois : piste en `--color-border-strong` `#3A3A3A` **et** initiale en
  `#FFFFFF` sans 600 (repère redondant, non chromatique) ;
- valeurs de maquette : L 68 · M 0 · M 92 · J 40 · V 0 · S 120 · D 92 UA →
  hauteurs 54 · 0 · 74 · 32 · 0 · 96 · 74 ;
- initiales sous les barres, gap 8 : `L M M J V S D` — `--text-caption` 12/16,
  `--color-foreground-subtle`.

**Une seule couleur de remplissage**, pas de barres empilées par discipline : empiler forcerait à
détourner le vert (récupération) et le bleu (charge) de leur sens métier. La décomposition est le
rôle de `S-split-card`.

Ligne de provenance sous le graphe, gap 12, **identique à la légende du Dashboard** (§2.3) :
`↻ Synchronisé   ✎ Déclaré` — `--text-caption`, `--color-foreground-muted`.

### 4.4 `S-split-card` — répartition par discipline

Fond `--color-surface`, `--radius-lg` 16, padding 20, gap 12.

- `RÉPARTITION · 7 DERNIERS JOURS` — `--text-label`, `--color-foreground-subtle`.
- 3 lignes de 36, gap 12 : nom à gauche (largeur 96, `--text-small`, `--color-foreground-muted`) ;
  barre au centre (largeur 140, hauteur 4, `--radius-full`, piste `--color-border-strong` `#3A3A3A`,
  remplissage `--color-accent` `#A78BFA`) ; pourcentage à droite (largeur 40, aligné à droite,
  `--text-small`, `#FFFFFF`).
- Maquette : Course 45 % · Musculation 35 % · Vélo 20 %.
- Une seule discipline → ligne unique à 100 % **plus** une phrase `--text-small`
  `--color-foreground-muted` : « Une seule discipline pour l'instant — le score hybride prend tout
  son sens à partir de deux. »

### 4.5 `S-context-card` — lecture du coach

Fond `--color-surface`, `--radius-lg` 16, padding 20, gap 12.

- label `CE QUE ÇA VEUT DIRE` — `--text-label`, `--color-accent-text` `#A78BFA` (sortie du coach IA).
- bloc imbriqué `--color-surface-raised` `#262626`, `--radius-md` 12, padding 16, texte
  `--text-body` `--color-foreground-muted`, 3-4 lignes, voix coach : « Ta charge est répartie sur
  trois disciplines, avec un pic samedi. C'est un profil hybride équilibré : tu peux encaisser une
  séance intense de plus cette semaine sans dégrader ta récupération. »
- sous le bloc, gap 12 : « En savoir plus → » — `--text-body-strong`, `--color-accent-text`.

### 4.6 État de calibration — `F2-score-hybride--calibration` (AC8)

Même header, même label, même titre serif. **Seule `S-score-card` change** ; les cartes volume et
répartition **restent affichées** — les données brutes sont fiables même quand l'agrégat ne l'est
pas, et AC9 interdit tout blocage.

`S-score-card--calibration`, fond `--color-surface`, `--radius-lg` 16, padding 20, gap 16, centré :

- **Anneau** 180 × 180 : piste `#3A3A3A` **complète, sans aucun segment violet**. Au centre, un
  tiret `—` en 48 px `--color-foreground-subtle` `#8B8B94`. **Aucun chiffre**, même grisé, même
  « approximatif » — c'est la demande littérale d'AC8.
- **Label** `CALIBRATION EN COURS` — `--text-label`, `--color-warning` `#F59E0B`. Même code que le
  bloc de calibration orange déjà présent dans `D-data-card` et que le label « JE N'AI PAS BIEN
  COMPRIS » de F1.
- **Titre de carte** « Pas encore de score fiable. » — `--text-title` 24/30 **serif 700**, `#FFFFFF`,
  centré.
- **Corps** — `--text-body`, `--color-foreground-muted`, centré : « Il me faut 4 semaines de données
  comparables pour te donner un score qui veut dire quelque chose. Tu en es à 2. »
  Formulation alignée sur le bloc existant du Dashboard (« Calibration en cours — 2 semaines sur
  4. »). Seuil = hypothèse d'affichage, à paramétrer (§6 écart 1).
- **`S-calibration-progress`** : largeur 235, hauteur 4, `--radius-full`, piste
  `--color-border-strong` `#3A3A3A`, remplissage `--color-accent` `#A78BFA` à 50 %, et à droite,
  gap 12, `2 / 4 semaines` en `--text-small` `--color-accent-text` `#A78BFA`. Patron identique au
  compteur `3 / 6` de l'onboarding et au `8 / 10` du RPE.
- **CTA** pleine largeur de carte (295) :
  - aucune source connectée ni déclarée → **pill violet** « Connecter mes sources » (56,
    `--radius-full`, texte `#0A0A0A`) → `F2-connexion-donnees` ;
  - sources déjà présentes → **bouton secondaire** (sans fond, `--text-button`,
    `--color-foreground-muted`) « Voir ma séance du jour ». Ne pas laisser un pill violet qui n'a
    rien à débloquer.

Le pill violet est légitime ici (contrairement à §1.1) : action unique et principale de la carte,
sans concurrence sur l'écran.

### 4.7 États de l'écran Score hybride

| État | Rendu |
| --- | --- |
| default | score chiffré, anneau rempli, delta signé, 4 cartes |
| calibration (AC8) | `F2-score-hybride--calibration` |
| empty absolu (0 séance) | anneau vide + tiret ; `S-volume-card` : 7 pistes `#262626` nues, `0 UA`, « Aucune séance enregistrée cette semaine. » + lien « Saisir une séance → » (`--color-accent-text`) ; `S-split-card` et `S-context-card` masquées |
| loading | squelettes `--color-surface-raised` `--radius-md` : disque 180, 7 rectangles, 3 lignes. Pas de spinner plein écran |
| error (calcul indisponible) | anneau vide + `--text-label` `--color-danger` `#F87171` « SCORE INDISPONIBLE » + message + bouton secondaire « Réessayer ». **Les autres cartes restent affichées** (AC9) |
| hover / focus / active / disabled | charte §4.1 et §4.2, sans dérogation |

---

## 5. Design tokens utilisés (aucun token de couleur ou de police nouveau)

**Couleurs.** `--color-background` `#0A0A0A` · `--color-surface` `#1A1A1A` ·
`--color-surface-raised` `#262626` · `--color-surface-sunken` `#141414` · `--color-border` `#262626` ·
`--color-border-strong` `#3A3A3A` · `--color-foreground` `#FFFFFF` · `--color-foreground-muted`
`#A1A1AA` · `--color-foreground-subtle` `#8B8B94` · `--color-foreground-on-accent` `#0A0A0A` ·
`--color-accent` / `--color-accent-text` `#A78BFA` · `--color-accent-hover` `#B9A3FB` ·
`--color-accent-pressed` `#8B5CF6` (remplissages uniquement) · `--color-success` `#4ADE80` ·
`--color-info` `#60A5FA` · `--color-warning` `#F59E0B` · `--color-danger` `#F87171`.

**Typographie.** `--font-serif` (Playfair Display 700) uniquement pour : `Tes données, réunies.`,
`Ton Score.` (display 32/36), `Pas encore de score fiable.`, `Déconnecter Strava ?` (title 24/30).
`--font-sans` (Inter) pour tout le reste : `--text-heading` 20/26 · `--text-metric` 22/26 ·
`--text-body` 15/24 · `--text-body-strong` 15/24 · `--text-button` 16/20 · `--text-small` 13/18 ·
`--text-caption` 12/16 · `--text-label` 11/14 0.14em. Seule extension : la valeur centrale de
l'anneau en **sans 700, 48 / 52** (§6 écart 2).

**Espacements.** `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 (gap entre cartes) ·
`space-5` 20 (gouttière et padding de carte) · `space-6` 24 · `space-8` 32 · `space-10` 40 ·
`space-12` 48. Grille de métriques : 2 colonnes, gap 16 h / 20 v.

**Rayons.** `--radius-md` 12 (blocs imbriqués, score-row) · `--radius-lg` 16 (cartes) ·
`--radius-xl` 20 (feuille de déconnexion) · `--radius-full` (pills, boutons ghost, badges, barres,
anneau à extrémités arrondies).

**Élévation.** Aucune ombre ; profondeur par luminosité `#0A0A0A` → `#1A1A1A` → `#262626`.
Seule exception admise : `--shadow-overlay` sous la feuille de déconnexion et la tab bar.

---

## 6. Accessibilité

**Contrastes** (tableau §5 de la charte, tous conformes) : `#FFFFFF` sur `#1A1A1A` 17,3:1 ·
`#A1A1AA` 6,8:1 · `#8B8B94` 5,2:1 · `#A78BFA` 6,4:1 · `#4ADE80` 10,0:1 · `#60A5FA` 6,9:1 ·
`#F59E0B` 8,1:1 · `#0A0A0A` sur pill `#A78BFA` 7,3:1. **Interdits appliqués** : aucun
`#71717A`/`#52525B`, aucun `#8B5CF6` porteur de texte, aucun blanc sur violet.

**Le symbole ou la couleur ne portent jamais seuls l'information** :

- glyphes de provenance `↻`/`✎` systématiquement explicités par la légende textuelle (§2.3, §4.3)
  et doublés d'un `aria-label` complet sur chaque cellule ;
- tendances toujours signées (`+4`, `−3`) **et** fléchées (`↑`, `↓`) ;
- jour courant du graphe marqué deux fois (piste plus claire + initiale blanche 600) ;
- état de calibration porté par un texte explicite, pas par un anneau vide seul ;
- badges d'état des sources : libellé textuel (`CONNECTÉ`, `NON CONNECTÉ`) et pas seulement la
  couleur du contour.

**Rôles et labels ARIA** :

- cellule de métrique : `aria-label="Charge : 412 unités, en hausse de 8 % par rapport à la semaine
  précédente, donnée synchronisée."` — le glyphe est `aria-hidden` ;
- anneau de score : `role="img"` + `aria-label="Score hybride : 72 sur 100, en hausse de 4 points
  depuis la semaine dernière."` ; en calibration : `aria-label="Score hybride non disponible,
  calibration en cours : 2 semaines sur 4."` ;
- graphe volume : conteneur `role="img"` + `aria-label` phrasant les 7 valeurs (« lundi 68 unités,
  mardi aucune séance, … ») ; équivalent tabulaire accessible via « Détail → » ;
- barre de calibration : `role="progressbar"` + `aria-valuenow="2" aria-valuemin="0"
  aria-valuemax="4"` + `aria-valuetext="2 semaines sur 4"` ;
- barres de répartition : `role="progressbar"` + `aria-label="Course : 45 %"` ;
- carte de source : `<section aria-labelledby>` pointant sur le nom ; le badge d'état est lié au
  bouton par `aria-describedby` (« Strava, non connecté ») ;
- carte d'invitation : `<section aria-labelledby>` sur son titre ; `✕` → `aria-label="Masquer cette
  invitation"` ;
- ligne Profil : un seul `<a>`/`<button>` englobant libellé + valeur + chevron, avec
  `aria-label="Sources de données, 2 connectées"` ; chevron `aria-hidden`.

**Focus et clavier** : `outline: 2px solid #A78BFA; outline-offset: 2px` sur tout élément focusable,
jamais supprimé ; ordre DOM = ordre visuel ; la feuille de déconnexion piège le focus et se ferme à
`Échap` ; le `✕` du header est le premier élément focusable des sous-écrans.

**Cibles tactiles** ≥ 44 × 44 : liens « Connecter mes sources → », « Détail → », « En savoir plus → »,
boutons ghost (44), ligne Profil (56), score-row (56), pills (56), `✕` du header (44).

**Zones live** : `aria-live="polite"` sur le recalcul du score après synchronisation (« Score hybride
mis à jour : 72. »), sur « Import en cours… » et sur les erreurs de synchronisation. Jamais
`assertive`.

**Mouvement** : sous `prefers-reduced-motion`, l'anneau et les barres apparaissent à leur valeur
finale, sans animation de remplissage.

---

## 7. Écarts et points à valider

1. **Seuil de calibration à 4 semaines** — question ouverte §7 de la fiche. Retenu comme hypothèse
   d'affichage, **aligné sur le bloc déjà présent dans `D-data-card`** (« 2 semaines sur 4 »), donc
   cohérent avec l'existant. Le libellé doit rester paramétré, jamais codé en dur.
2. **Format du score : anneau + valeur sur 100** — question ouverte §7 (chiffre / courbe /
   décomposition). Choix fait sur consigne de cadrage ; la décomposition est traitée par une carte
   secondaire. La valeur centrale en **sans 700, 48 / 52** est une **extension de l'échelle
   typographique** (`--text-metric` 22 px est trop petit pour un chiffre héros) → à entériner dans
   `docs/design-system.md` sous `--text-score`. Aucune police ni couleur nouvelle. `/ 100` est une
   convention d'affichage, pas une formule : elle n'engage `architect` qu'à normaliser sa sortie
   sur 0-100.
3. **Bouton de masquage de la carte d'invitation** (§1.1) : proposition de design, non tranchée par
   la fiche. À valider ou supprimer.
4. **Marqueur de provenance : glyphe `↻`/`✎` gris, et non pastille colorée.** Correction par rapport
   à la première version de cette note, imposée par le relevé réel : la ligne de label est déjà
   colorée par sémantique métier et le bleu y désigne « Charge ». Effet de bord assumé : le suffixe
   `· déclaratif` de la cellule Sommeil est remplacé par `✎` (homogénéisation des 4 cellules).
5. **Lien « Détail → » du Dashboard** : ouvre une vue de détail par source, requise par l'AC6
   (« l'origine reste identifiable si Thomas veut vérifier le détail ») mais **non maquettée** ici —
   hors des livrables demandés. À cadrer avec `architect` puis à maquetter.
6. **Consentement RGPD des données importées** : question ouverte §7. Si un consentement dédié est
   requis, il s'insère dans le flux OAuth en réutilisant `qFZLF` — non maquetté.
7. **Écran Profil traité en frame partiel** (`F2-profil-extrait`, 375 × 420) : l'onglet Profil
   n'existe dans aucun frame F1. Le frame ne prétend pas définir tout l'écran, seulement le point
   d'entrée demandé. À garder en `placeholder: true` jusqu'à conception complète de Profil.
8. **`D-planning-card` et l'écran Planning semaine n'ont pas été touchés**, ni aucune autre zone du
   Dashboard hors `D-data-*`.
