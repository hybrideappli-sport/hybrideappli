# Notes de design — trous de conception F2 / F3 (questions 13, 14, 15, 17, 18)

> Rédigé par `designer` le 2026-08-12.
> Entrées : `08-architecture.md` §12 (questions 13, 14, 15, 17, 18), §13.3, §14.5, §14.7 ;
> `docs/design-system.md` (charte v1) ; `09-design-feature2-notes.md` ; `10-design-feature3-notes.md` ;
> **relevé visuel direct** des écrans réels `jSZB0` (Dashboard, état à jour avec les cartes F2 et F3)
> et `MqvfH` (Séance du jour), exports 2× du 2026-08-12.
>
> Destinataires : l'intervenant disposant de `execute` sur Pencil (implémente §1 → §4 tel quel),
> et `developer` (toutes les valeurs sont des tokens de `docs/design-system.md`, aucune valeur inventée).

---

## 0. Statut d'accès Pencil — lecture seule, une fois de plus

| Outil | Disponible | Résultat |
| --- | --- | --- |
| `get_screenshot` | ✅ | `document`, `MqvfH`, `jSZB0` — bon fichier confirmé |
| `export_nodes` | ✅ | exports 2× de `jSZB0` et `MqvfH` exploités pour caler cette note |
| `get_app_state` | ❌ | non enregistré dans le registre d'outils de la session |
| `execute` | ❌ | non enregistré — **aucune écriture possible** |
| `export_html` | ❌ | non exposé |

Conséquence : `GetVariables()` n'a pas pu être appelé. Les tokens utilisés ci-dessous sont **ceux de
`docs/design-system.md`**, tous déjà présents dans le rendu réel des écrans (vérifié à l'export :
violet `#A78BFA`, orange `#F59E0B`, bleu `#60A5FA`, vert `#4ADE80`, surfaces `#0A0A0A`/`#1A1A1A`/`#262626`).
**Aucun token nouveau n'est introduit par cette note.**

**Aucun livrable n'est sauté** : les quatre sont spécifiés ci-dessous à un niveau directement
implémentable, dans le même patron que `09-design-feature2-notes.md` et `10-design-feature3-notes.md`.

Conventions d'implémentation Pencil : `placeholder: true` sur tout frame nouveau jusqu'à validation ;
placement des nouveaux frames via `FindEmptySpace` ; ne rien déplacer d'existant.

### 0.bis Relevé de l'existant utile à cette note

**`jSZB0` (Dashboard, état réel au 2026-08-12)** — ordre constaté :
header → `MERCREDI 4 AOÛT` → `Bonjour Thomas.` → `PLAN DU JOUR · COACH IA` → `NUTRITION DU JOUR` →
`SYNCHRONISATION` (invitation) → `MES DONNÉES · 7 DERNIERS JOURS` (avec `Détail →`, glyphes `↻`/`✎`,
légende, bloc calibration orange, ligne `Score hybride 72 ›`) → `PLANNING GLISSANT · J → J+7`
(colonne heure + badges `DÉPLACÉE` / `ANNULÉE`) → carte paywall → tab bar
`Aujourd'hui · Séance · Planning · **Profil**`.

> **Écart signalé, hors périmètre** : cet ordre place `D-planning-card` **après** les deux cartes F2,
> alors que `08-architecture.md` §14.4 arrête l'ordre inverse (planning en 3ᵉ position, F2 en 4ᵉ/5ᵉ).
> Je ne le corrige pas ici (ce n'est aucun des 4 livrables) mais il faut trancher : soit la maquette
> s'aligne sur §14.4, soit §14.4 s'aligne sur la maquette. Ne pas laisser les deux ordres coexister.

**`MqvfH` (Séance du jour)** — patrons réutilisés tels quels au §2 :
- header : tuile logo 40 (rayon 10) + `SÉANCE DU JOUR` (`--text-label`) + `Mer. 4 août` à droite ;
- titre serif + ligne de méta `52 min   RPE cible 7   Course` (`--text-small` muted, gap ~24) ;
- **bloc conditionnel imbriqué** `POURQUOI PARTIELLEMENT ?` : fond `--color-surface-raised` `#262626`,
  `--radius-md` 12, padding 16, label `--text-label` `--color-foreground-subtle`, une rangée de chips,
  puis une phrase d'aide `--text-small` `--color-foreground-subtle`. **C'est le patron exact du
  formulaire rapide** — le §2 ne fait que le réemployer ;
- chips 44 px `--radius-full`, sélection violette (orange dans le domaine douleur) ;
- CTA `Enregistrer` pill violet pleine largeur, puis mention `--text-caption` centrée.

---

## Décision de nommage — **« Compte » partout** (question 15)

**Tranché : le mot retenu est « Compte ». « Profil » disparaît de l'interface.**

| Objet | Avant | Après |
| --- | --- | --- |
| Route | `/compte` (code) vs « Profil » (design) | **`/compte`** |
| 4ᵉ onglet de la tab bar | `Profil` | **`Compte`** |
| Titre d'écran | `PROFIL` | **`MON COMPTE`** (`--text-label`, `--color-foreground-muted`) |
| Frame Pencil `09-design-feature2-notes.md` §1.2 | `F2-profil-extrait` | **`F2-compte-extrait`** |
| `aria-label` de l'onglet | — | `Mon compte` |

Trois raisons, dans cet ordre :

1. **`/compte` est déjà livré et testé en F1** (`DegradedModeBanner` y est rendu, `08-architecture.md`
   §12 point 4). Renommer la route pour aligner un mot de maquette coûte une migration d'URL, des
   redirections et une réécriture de doc, pour zéro valeur utilisateur. Le design s'aligne sur le code
   quand le code est déjà juste.
2. **Le contenu de l'écran est un compte, pas un profil sportif** : abonnement, consentements,
   suppression de compte, sources de données. Le « profil » sportif (objectif, historique, disciplines)
   est construit par l'onboarding et vit dans `athlete_profiles`.
3. **« Profil » est déjà pris** par le vocabulaire produit (« profil athlète », `athlete_profiles`,
   `PlanningContext`). Garder les deux mots pour deux choses différentes serait la vraie dette.

**Modifications Pencil induites** (à faire par l'intervenant en écriture, en même temps que §1 → §4) :
le libellé `Profil` de la tab bar → `Compte` sur **tous** les frames qui portent une tab bar
(`jSZB0` au minimum, et tout frame F2/F3 en réutilisant le composant). Si la tab bar est un composant
partagé, une seule édition suffit — à vérifier via `get_app_state`.

> Rappel : `08-architecture.md` §12 question 20 signale qu'**aucune tab bar n'existe en code**.
> Cette décision de nommage vaut quel que soit l'arbitrage rendu sur ce point ; elle ne le remplace pas.

---

## 1. Livrable 1 — Écran « Détail par source » (F2, question 13, AC6)

**Cible du lien `D-data-detail-link` (« Détail → ») déjà posé sur `D-data-card`.**
Sans cet écran, le lien est un cul-de-sac.

**Route** : `/donnees/activites`. **Nature** : sous-écran — patron `Yf6zY` / Connexion données :
header logo + titre + `✕`, **pas de tab bar**.

**Frame à créer** : `9 — Détail par source`, largeur **375**, hauteur ~1320 (scroll),
fond `--color-background` `#0A0A0A`, gouttières 20 → colonne 335.

Source de données : `GET /api/v1/data/activities?from&to` → `ActivityFeedItem[]`
(`08-architecture.md` §13.3), provenance par élément (`synced` | `declared`), **fusions incluses**.

### 1.1 Header — `A-header`

Hauteur 56, fond `--color-surface-sunken` `#141414`.
Tuile logo blanche 40 × 40 rayon 10 (composant `LogoHybride` `SHhZ3`) + gap 16 +
`DÉTAIL PAR SOURCE` en `--text-label` `--color-foreground-muted` ; à droite `✕` 24 px
`--color-foreground-muted`, cible 44 × 44, `aria-label="Fermer"`, **premier élément focusable**.

### 1.2 En-tête éditorial

```
space-8 (32)
7 DERNIERS JOURS · 12 ACTIVITÉS   --text-label, --color-foreground-subtle
space-2 (8)
Tes activités.                     --text-display 32/36 serif 700, #FFFFFF
space-3 (12)
« Chaque ligne porte sa provenance. Si j'ai mal interprété quelque chose, tu peux le corriger. »
                                   --text-body 15/24, --color-foreground-muted
space-6 (24)
```

Serif justifié : c'est une prise de parole éditoriale du coach, même famille que `Bonjour Thomas.`
et `Tes données, réunies.`

### 1.3 Bandeau de synthèse — `A-detail-summary`

Bloc imbriqué 335 × 68, fond `--color-surface-raised` `#262626`, `--radius-md` 12, padding 16,
gap 4 — **même famille visuelle que le bloc de calibration de `D-data-card`**.

- Ligne 1 : `412 UA sur la période` — `--text-body-strong` 15/24, `#FFFFFF`.
- Ligne 2 : `9 synchronisées ↻   ·   3 déclarées ✎` — `--text-small` 13/18,
  `--color-foreground-muted`, glyphes 12 px `--color-foreground-subtle`, `aria-hidden` (le mot porte
  déjà l'information).

Gap 16 avant les filtres.

### 1.4 Filtres — `A-filters`

Une rangée, hauteur 44, gap 8 — **chips de la charte §4.4**, en `role="radiogroup"`
`aria-label="Filtrer par provenance"` :

| Chip | État initial | Rendu |
| --- | --- | --- |
| `Tout` | sélectionné | fond `--color-accent` `#A78BFA`, texte `--color-foreground-on-accent` `#0A0A0A` |
| `Synchronisé` | non sélectionné | transparent, texte `--color-foreground-muted`, glyphe `↻` 12 px en tête, gap 4 |
| `Déclaré` | non sélectionné | idem, glyphe `✎` |

Hauteur 44, `--radius-full`, padding horizontal 20, `--text-body-strong`.
Survol → fond `--color-surface-raised` `#262626` + texte `#FFFFFF`. Focus sur chip violette →
**outline blanc 2 px** (charte §5).

À droite de la rangée, poussé en fin de ligne : `A-period-trigger` — `7 jours ▾`,
`--text-small` sans 600, `--color-foreground-muted`, cible ≥ 44 px. Ouvre une petite feuille
(`--radius-xl` 20, fond `--color-surface`) à 3 options `7 jours` / `30 jours` / `90 jours`, qui pilote
`from` et `to`. La feuille piège le focus et se ferme à `Échap`.

Gap 24 avant la première journée.

### 1.5 Groupe-jour — `A-day-group`

Reprend la grammaire de l'écran Planning semaine (`10-design-feature3-notes.md` §1.3) :

- label de jour `MER. 4 AOÛT` — `--text-label`, `--color-foreground-subtle`, posé **sur le fond**,
  hors carte (patron `MqvfH`) ;
- gap 12 ;
- une carte-liste `A-day-card` : 335, fond `--color-surface` `#1A1A1A`, `--radius-lg` 16,
  padding vertical 4, **pas de bordure, pas d'ombre** ;
- séparateur 1 px `--color-border` `#262626`, largeur intérieure 295, entre deux lignes, **jamais
  sous la dernière** ;
- gap 24 entre deux groupes-jour ; `space-12` (48) de marge basse en fin d'écran.

### 1.6 Ligne d'activité — `A-activity-row`

Hauteur ≥ 72, padding 16 vertical / 20 horizontal, deux colonnes : gauche flex 1, droite auto,
alignées sur la **première ligne de base**.

| Zone | Contenu | Style |
| --- | --- | --- |
| Gauche L1 | `Sortie longue — 1 h 40 en Z2` | `--text-body-strong` 15/24, `#FFFFFF`, 1 ligne, ellipsis |
| Gauche L2 | `09h12   ·   1 h 40   ·   Course` | `--text-small` 13/18, `--color-foreground-muted` |
| Gauche L3 | `↻ Strava` ou `✎ Saisie manuelle` | `--text-small` 13/18, `--color-foreground-subtle` ; glyphe 12 px `aria-hidden`, gap 4 |
| Droite | `82 UA` | `--text-body-strong` 15/24, `#FFFFFF` |

Gap vertical interne 4.

**Le glyphe n'est jamais seul** : il est systématiquement doublé du nom de la source en toutes
lettres (`Strava`, `Saisie manuelle`). C'est ce qui rend cet écran conforme à la règle « la couleur
ou le symbole ne portent jamais seuls l'information », là où le Dashboard s'appuie sur une légende.

**La ligne n'est pas cliquable en V1** : `GET /data/activities` ne sert pas de détail d'activité, et
il n'existe aucun écran de niveau 3. Ne pas poser de chevron `›` : il promettrait une profondeur
inexistante.

### 1.7 Variante fusionnée — `A-activity-row--merged` (AC5)

Quand `GET /data/activities` remonte une fusion (`superseded_by_log_id` / `excluded_at`), la ligne
**absorbante** porte :

- sur L1, à droite du titre, gap 8 : badge pill outline `FUSIONNÉE` — contour 1 px
  `--color-border-strong` `#3A3A3A`, fond transparent, `--text-label` 11/14
  `--color-foreground-subtle`, `--radius-full`, padding 4 / 10 (charte §4.5, variante `neutral`) ;
- L3 devient : `↻ Strava · a remplacé ta saisie manuelle de 09h20` —
  `--text-small` `--color-foreground-subtle` ;
- L4 (nouvelle, gap 8) : lien `Séparer les deux` — `--text-small` sans 600,
  `--color-accent-text` `#A78BFA`, cible ≥ 44 px → `POST /session-logs/:id/unmerge`.

La ligne **absorbée** n'est pas rendue : elle réapparaît, sans badge, après `unmerge`, annoncé en
`aria-live="polite"` (« Les deux séances sont de nouveau comptées séparément. »).

Badge **neutre et non orange** : une fusion réussie n'est pas une alerte, c'est le comportement
nominal de l'AC5. L'orange resterait réservé à l'imprévu et à la douleur.

### 1.8 Variante non réalisée — `A-activity-row--not-done` (croisement avec le §3)

Une séance comptée `not_done` par la clôture automatique apparaît **aussi** dans ce détail, sinon
l'écran mentirait sur la période. Rendu :

- L1 : intitulé en `--color-foreground-muted` `#A1A1AA` (jamais d'`opacity`), + badge pill outline
  `NON RÉALISÉE` — contour 1 px `--color-warning` `#F59E0B`, `--text-label` `#F59E0B` ;
- L2 : `mar. 18h30 · Course` — `--color-foreground-subtle` ;
- L3 : `Comptée comme non réalisée après ton imprévu.` — `--color-foreground-subtle` ;
- L4 : lien `Je l'ai faite quand même` — `--text-small` `--color-accent-text`, cible 44
  (même action qu'au §3.3) ;
- Droite : `0 UA` — `--text-body-strong` `--color-foreground-subtle`.

### 1.9 États de l'écran

| État | Rendu |
| --- | --- |
| `default` | synthèse + filtres + groupes-jour |
| `loading` | squelettes `--color-surface-raised` `--radius-md` : 1 bandeau 68, 3 cartes-jour de 3 lignes. Pas de spinner plein écran |
| `empty` (période sans activité) | en-tête éditorial conservé ; `--text-title` 24/30 serif `Rien sur cette période.` + `--text-body` `--color-foreground-muted` « Change la période, ou enregistre une séance depuis Séance du jour. » + lien `Saisir une séance →` (`--color-accent-text`). **Pas de pill violet** : l'écran est une consultation |
| `empty` (filtre vide) | ligne unique `--text-body` `--color-foreground-muted` : « Aucune activité synchronisée sur cette période. » — les filtres restent actifs, ne jamais vider l'écran entier |
| `error` | carte `--color-surface`, `--text-label` `--color-danger` `#F87171` `CHARGEMENT IMPOSSIBLE`, message, bouton secondaire `Réessayer` |
| `hover / focus / active / disabled` | charte §4.1, §4.2 et §4.4, sans dérogation ; focus `outline 2px #A78BFA offset 2` |

### 1.10 Accessibilité spécifique

- `A-day-card` = `<ul>`, chaque ligne = `<li>`. Le label de jour = `<h2>` du `<section>`.
- `aria-label` complet par ligne : `« Sortie longue, 1 h 40 en zone 2, mercredi 4 août à 9 h 12,
  course, 82 unités de charge, donnée synchronisée depuis Strava. »` — les glyphes sont `aria-hidden`.
- Filtres : `role="radiogroup"` + `role="radio" aria-checked`, navigation aux flèches.
- Le changement de filtre ou de période est annoncé en `aria-live="polite"`
  (« 9 activités synchronisées sur 7 jours. »).
- Cibles ≥ 44 : `✕`, chips, `7 jours ▾`, `Séparer les deux`, `Je l'ai faite quand même`.

---

## 2. Livrable 2 — Affordance « séance hors plan » (F2, question 14, AC3)

**Problème** : `MqvfH` ne sait rendre compte que de la séance **prévue**. Un utilisateur qui fait une
muscu non planifiée n'a aucun moyen de l'enregistrer — ce qui contredit frontalement l'AC3
(« jamais bloqué faute d'intégration pour son sport »).

**Contrainte tenue** : formulaire rapide. Le bloc ci-dessous se remplit **entièrement au doigt**,
sans clavier, en 4 appuis. Aucune modale, aucun écran supplémentaire.

API : `POST /api/v1/session-logs` avec `plannedSessionId: null` et les champs US-02 déjà prévus
(`sportCode`, `sessionType`, `startedAt` — `08-architecture.md` §6.4).

### 2.1 Le composant central — `S-offplan-block`

Réemploi **strict** du patron `POURQUOI PARTIELLEMENT ?` relevé sur `MqvfH` :
bloc imbriqué 335 (ou 295 s'il est dans une carte), fond `--color-surface-raised` `#262626`,
`--radius-md` 12, padding 16, gap vertical 12, sans bordure ni ombre.

```
┌─ S-offplan-block ────────────────────────────────────────┐
│  SÉANCE HORS PLAN                                     ✕  │
│                                                          │
│  Discipline                                              │
│  ( Musculation ) ( Course ) ( Vélo ) ( Autre )           │
│                                                          │
│  Type                                                    │
│  ( Endurance ) ( Intensité ) ( Force ) ( Mobilité )      │
│                                                          │
│  Durée                                                   │
│  ( 30 ) ( 45 ) ( 60 ) ( 90 min ) ( Autre )               │
│                                                          │
│  Début                                                   │
│  [ 18:30 ]                                               │
│                                                          │
│  Je la compte en plus de ton plan, sans rien décaler.    │
└──────────────────────────────────────────────────────────┘
```

| Nœud | Contenu | Style |
| --- | --- | --- |
| `S-offplan-label` | `SÉANCE HORS PLAN` | `--text-label` 11/14 0.14em sans 600, `--color-foreground-subtle` `#8B8B94` |
| `S-offplan-dismiss` | `✕` 20 px, aligné à droite du label | `--color-foreground-subtle`, cible 44 × 44, `aria-label="Annuler cette séance hors plan"` |
| `S-offplan-field-label` (× 4) | `Discipline` / `Type` / `Durée` / `Début` | `--text-small` 13/18, `--color-foreground-muted`, gap 8 au-dessus du contrôle |
| `S-offplan-chips-*` | rangées de chips | charte §4.4 : hauteur 44, `--radius-full`, padding h 20, `--text-body-strong` ; non sélectionnée transparente `--color-foreground-muted`, **sélectionnée `--color-accent` `#A78BFA` + texte `#0A0A0A`** ; wrap sur 2 lignes si nécessaire, gap 8 |
| `S-offplan-time` | champ heure, valeur pré-remplie à l'heure courante arrondie à 5 min | hauteur 52, `--radius-md` 12, **fond `--color-surface` `#1A1A1A`**, texte `--text-body` `#FFFFFF`, pas de bordure au repos |
| `S-offplan-help` | « Je la compte en plus de ton plan, sans rien décaler. » | `--text-small` 13/18, `--color-foreground-subtle` |

Trois précisions qui ne se devinent pas :

1. **Le champ heure est en `--color-surface` `#1A1A1A`, pas en `--color-surface-raised`.** C'est la
   seule dérogation à la charte §4.6, et elle est nécessaire : un champ `#262626` dans un bloc
   `#262626` serait invisible. La règle générale devient : *un champ imbriqué dans un bloc raised
   descend d'un cran de luminosité au lieu de monter.* À entériner dans `docs/design-system.md` §4.6.
2. **`Autre` sur la discipline** ouvre un `select` (charte §4.6, chevron `--color-foreground-muted`)
   listant le référentiel `sports`. **`Autre` sur la durée** remplace la rangée par un champ
   numérique 52 px. Dans les deux cas, on ne quitte pas le bloc.
3. **Aucun champ n'est obligatoire sauf `Discipline` et `Durée`.** `Type` par défaut = `Endurance`
   (`Force` si discipline = `Musculation`) ; `Début` par défaut = maintenant. Un formulaire rapide
   n'exige rien qu'il puisse déduire.

Le violet est légitime pour la sélection des chips (c'est le pattern de sélection standard de
`MqvfH`) ; **il n'y a pas de second CTA violet** dans le bloc — la validation passe par le CTA
`Enregistrer` déjà présent sur l'écran.

### 2.2 Cas A — une séance est prévue aujourd'hui (`MqvfH` nominal)

Ajout **d'un seul nœud** au frame `MqvfH` existant : `S-offplan-trigger`, inséré
**entre la mention `--text-caption` sous le CTA `Enregistrer` et la carte « Ce qui change cette
semaine »**, `space-6` (24) au-dessus, `space-6` en dessous.

- Libellé : `+ Enregistrer une séance hors plan` — `--text-small` 13/18 sans **600**,
  `--color-accent-text` `#A78BFA`, aligné à gauche sur la gouttière, cible ≥ 44 px de haut.
- Bouton **tertiaire**, jamais un pill : le pill violet de l'écran est déjà pris par `Enregistrer`
  (charte §4.1 : un seul CTA primaire par écran).
- Au clic : le lien est **remplacé sur place** par `S-offplan-block` (§2.1), et le focus est déplacé
  sur le premier chip de `Discipline`. Aucune navigation.
- Le CTA `Enregistrer` **ne change pas de libellé** et soumet les deux logs : celui de la séance
  prévue et celui de la séance hors plan (deux `POST /session-logs`).
- Le `✕` du bloc referme et restaure le lien.

| État de `S-offplan-trigger` | Rendu |
| --- | --- |
| `default` | `#A78BFA` |
| `hover` | `--color-accent-hover` `#B9A3FB` + soulignement |
| `focus-visible` | `outline 2px #A78BFA`, offset 2 |
| `active` | fond `--color-accent-subtle` `#241E3A`, `--radius-full`, texte maintenu `#A78BFA` |
| `expanded` | remplacé par `S-offplan-block`, `aria-expanded="true"` sur le déclencheur logique |
| `disabled` | jamais. Cette affordance ne se désactive dans aucun cas — c'est le sens même de l'AC3 |

### 2.3 Cas B — aucune séance prévue (jour de repos, ou séance déjà enregistrée)

**Nouveau frame** : `7b — Séance du jour · hors plan`, 375 × ~1100.
Même header que `MqvfH` (`SÉANCE DU JOUR` + `Mer. 4 août`). Structure :

```
space-10 (40)
Repos aujourd'hui.              --text-display 32/36 serif 700, #FFFFFF
space-3 (12)
« Rien n'est prévu. Si tu as bougé quand même, dis-le moi : je le compte. »
                                --text-body 15/24, --color-foreground-muted
space-8 (32)
S-offplan-block                 §2.1, largeur 335, DÉPLIÉ D'EMBLÉE
space-6 (24)
TES SIGNAUX · 20 SECONDES       --text-label, --color-foreground-subtle
   2 · RPE ressenti             (identique à MqvfH, questions 2 → 6)
   3 · Fraîcheur au réveil
   4 · Douleur ou gêne ?
   5 · Tu as suivi les repères du jour ?
   6 · Ton énergie sur la journée
space-6 (24)
[ Enregistrer ma séance ]       pill 335 × 56, --color-accent, texte #0A0A0A
space-3 (12)
« Un signal négatif peut faire baisser ta charge dès demain. Une hausse, elle,
  attendra la révision de dimanche. »   --text-caption, --color-foreground-subtle, centré
space-12 (48)
```

Points structurants :

- **La question 1 (`Tu as fait la séance ?`) disparaît** : elle n'a pas de sens sans séance prévue.
  La numérotation des questions restantes est **renumérotée 1 → 5** dans ce frame (ne pas laisser un
  écran qui commence à « 2 »). Le label de section devient `TES SIGNAUX · 20 SECONDES`.
- **Le bloc est déplié d'emblée**, sans lien déclencheur : c'est l'objet principal de l'écran.
  Le `✕` de `S-offplan-block` est donc **masqué** dans ce contexte.
- Les questions 2 → 6 conservent leur rendu, leurs couleurs et leur sémantique **à l'identique**
  (chips violettes, domaine douleur en orange `#F59E0B`, curseur RPE violet). Rien n'est redessiné.
- Le RPE et la fraîcheur portent alors sur la séance hors plan qui vient d'être décrite — pas
  d'ambiguïté possible, il n'y en a qu'une sur l'écran.

**Point d'entrée du cas B** : le CTA de `CoachPlanCard` sur le Dashboard, dont le libellé passe de
`Voir ma séance du jour` à **`Enregistrer une séance`** quand `TodayPlan.session === null`
(jour de repos). Aucun autre changement sur le Dashboard.

### 2.4 États du bloc

| État | Rendu |
| --- | --- |
| `default` | Discipline et Durée non renseignées, `Type` et `Début` pré-remplis |
| `incomplet` | le CTA `Enregistrer` reste **actif visuellement** mais expose `aria-disabled="true"` + message `--text-small` `--color-danger` `#F87171` sous le bloc : « Il me faut au moins la discipline et la durée. », lié en `aria-describedby`. **Jamais un bouton grisé muet** (charte §5, contenu sensible) |
| `loading` | CTA en `loading` : spinner 16 px `#0A0A0A`, libellé conservé, `aria-busy="true"` |
| `error` réseau | le bloc conserve **toutes** les saisies ; message `--text-small` `--color-danger` + lien `Réessayer`. Ne jamais vider un formulaire rempli |
| `success` | le bloc est remplacé par une ligne `--text-small` `--color-success` `#4ADE80` : `✓ Muscu de 45 min enregistrée.`, annoncée `aria-live="polite"` ; le lien `+ Enregistrer une séance hors plan` réapparaît en dessous (on peut en saisir plusieurs) |

### 2.5 Accessibilité spécifique

- Chaque rangée de chips = `role="radiogroup"` avec `aria-labelledby` pointant sur son label de champ
  (`Discipline`, `Type`, `Durée`) ; `role="radio" aria-checked` sur chaque chip ; flèches clavier.
- `S-offplan-trigger` : `aria-expanded`, `aria-controls` vers `S-offplan-block`.
- Le champ heure porte un `<label>` visible (`Début`) — pas de placeholder en guise de label.
- Focus déplacé sur le premier chip à l'ouverture, restauré sur le déclencheur à la fermeture.
- Cibles ≥ 44 × 44 : chips 44, champ 52, `✕` 44, lien déclencheur 44.

---

## 3. Livrable 3 — État `not_done` automatique, visible et corrigeable (F3, question 17)

**Problème** : à 03 h locale, `closeOutScheduleIncidents()` crée un `session_log` `not_done`
(`load_units = 0`, ADR-017 / §14.7). Aucun écran ne le montre. Un utilisateur qui s'est entraîné sans
rien déclarer voit son observance baisser à son insu, et `evaluateStagnation()` peut poser un
diagnostic `nonadherence` sur une donnée fausse que personne ne lui a jamais soumise.

**Principe de design** : le coach **dit ce qu'il a compté**, et laisse corriger. Jamais de
notification agressive, jamais de rouge : un `not_done` n'est ni une erreur ni une faute, c'est une
déduction du coach — et une déduction se montre.

Correction : `PATCH /api/v1/session-logs/:id` (existe déjà, `08-architecture.md` §6.4 — exige le
consentement santé, `403 CONSENT_REQUIRED` sinon).

### 3.1 Dashboard — carte `D-notdone-notice`

**Placement** : dans `jSZB0`, **immédiatement après `CoachPlanCard` (plan du jour), avant la carte
Nutrition**. Gap `space-4` (16) de part et d'autre.

Justification du placement : le plan du jour reste premier (contrainte non négociable,
`07-spec-feature1-coach-ia.md` §6) ; mais l'information doit être vue le jour même, donc au-dessus
des cartes d'enrichissement F2 et de l'aperçu planning. Ce n'est pas un bandeau de sécurité : elle
**ne monte pas** au-dessus du plan.

Boîte : 335 × ≈ 172, fond `--color-surface` `#1A1A1A`, `--radius-lg` 16, padding 20,
pas de bordure ni d'ombre, gap vertical interne 12.

| Nœud | Contenu | Style |
| --- | --- | --- |
| `D-notdone-label` | `SÉANCE NON RÉALISÉE` | `--text-label` 11/14 0.14em sans 600, `--color-warning` `#F59E0B` |
| `D-notdone-title` | `Mar. 3 août · Seuil — 3 × 8 min` | `--text-body-strong` 15/24, `#FFFFFF` |
| `D-notdone-body` | « Tu m'as signalé un imprévu mardi et je n'ai pas trouvé de créneau de remplacement. Je l'ai comptée comme non réalisée. » | `--text-body` 15/24, `--color-foreground-muted` |
| `D-notdone-actions` | rangée, gap 24, cibles ≥ 44 | voir ci-dessous |

`D-notdone-actions` :

- `D-notdone-fix` — `Je l'ai faite quand même` — `--text-small` 13/18 sans **600**,
  `--color-accent-text` `#A78BFA` ;
- `D-notdone-confirm` — `C'est exact` — `--text-small` 13/18 sans 400,
  `--color-foreground-muted` → `#FFFFFF` au survol.

**Orange et non rouge** : cohérent avec tout le traitement de l'imprévu en F3
(`10-design-feature3-notes.md` §5.4) ; `--color-danger` reste réservé aux erreurs de formulaire et
aux échecs techniques.

**Pas de pill violet, pas de `✕` de fermeture** : les deux actions sont symétriques et explicites,
et un `✕` laisserait croire qu'on peut faire disparaître le fait sans le trancher.

**Règle d'affichage** : rendue s'il existe au moins un `session_log` `not_done` créé
**automatiquement** (par la clôture, pas par l'utilisateur) au cours des **48 dernières heures** et
non encore acquitté. S'il y en a plusieurs, la carte porte la plus récente et une ligne supplémentaire
`--text-small` `--color-foreground-subtle` : `+ 1 autre séance concernée · Voir le planning →`
(lien `--color-accent-text`, cible 44). **Jamais deux cartes empilées.**

> **À prévoir côté technique** (à remonter à `architect`) : il faut distinguer un `not_done`
> **automatique** d'un `not_done` **déclaré par l'utilisateur** (la carte ne doit jamais s'afficher
> pour un `not_done` que l'utilisateur a lui-même saisi via `MqvfH`), et il faut un moyen d'acquitter
> (`C'est exact`) sans modifier la donnée métier. Deux besoins non couverts par les contrats actuels.

### 3.2 États de `D-notdone-notice`

| État | Rendu |
| --- | --- |
| `default` | tel que décrit |
| `loading` | squelette `--color-surface-raised` `--radius-md` aux dimensions de la carte |
| après `C'est exact` | la carte est remplacée pendant ~3 s par une ligne `--text-small` `--color-foreground-muted` : « C'est noté. », annoncée `aria-live="polite"`, puis disparaît ; le gap se referme |
| après correction réussie | ligne `--text-small` `--color-success` `#4ADE80` : `✓ Séance comptée comme réalisée.`, `aria-live="polite"`, puis disparition |
| `error` (`PATCH` en échec) | la carte reste, + ligne `--text-small` `--color-danger` `#F87171` : « La correction n'a pas pu être enregistrée. Réessayer. » |
| consentement santé retiré | **carte non rendue** : `PATCH` répondrait `403`, proposer une correction impossible serait un piège. Le `DegradedModeBanner` existant porte déjà l'explication |

### 3.3 Parcours de correction — aucun écran nouveau

`Je l'ai faite quand même` **ne poste rien directement** : une séance « faite » sans durée ni RPE
n'apprend rien au coach, et un `PATCH` silencieux serait aussi opaque que le `not_done` qu'il corrige.

Le lien route vers `/aujourdhui?log=<id>` — c'est-à-dire **l'écran `MqvfH` en mode correction** :

- header : `SÉANCE DU JOUR` → **`CORRIGER UNE SÉANCE`**, méta de droite = la date de la séance
  concernée (`Mar. 3 août`), et le `✕` du patron sous-écran remplace la tab bar ;
- titre serif et ligne de méta = ceux de la séance concernée, **inchangés** ;
- question 1 `Tu as fait la séance ?` **pré-répondue `Oui`** (chip violette sélectionnée) ;
- une ligne d'aide sous la question 1, `--text-small` `--color-foreground-subtle` :
  « Je l'avais comptée comme non réalisée. » ;
- questions 2 → 6 vides, à remplir normalement ;
- CTA `Enregistrer` → `PATCH /session-logs/:id`.

**Frame Pencil** : `7c — Séance du jour · correction`, 375 × ~1200. C'est une **variante de `MqvfH`**,
pas un écran nouveau : dupliquer `MqvfH`, changer le header, pré-sélectionner `Oui`, insérer la ligne
d'aide, supprimer la carte « Ce qui change cette semaine » (hors sujet dans une correction).

### 3.4 Planning semaine — état (d) « Non réalisée »

Quatrième état de carte séance, à ajouter au frame `8 — Planning semaine` et au frame de variantes
`8b — Planning semaine · états` (`10-design-feature3-notes.md` §1.9). Il complète les états
(a) normale, (b) déplacée, (c) annulée.

| Zone | Contenu | Style |
| --- | --- | --- |
| Liseré gauche | — | 3 px `--color-border-strong` `#3A3A3A`, `--radius-full` — **décoratif**, comme l'état (c) |
| Badge (1re ligne) | `NON RÉALISÉE` | pill outline *warning* : contour 1 px `#F59E0B`, fond transparent, `--text-label` `#F59E0B`, `--radius-full`, padding 4/10 |
| Ligne 2 | `mar. 18h30` seul, ou `mar. 18h30 → jeu. 07h00` si la séance avait été déplacée | `--text-small` `--color-foreground-subtle` **en entier** — y compris le nouvel horaire, qui n'est plus en `--color-warning` : plus rien n'est à venir |
| Ligne 3 | `Seuil — 3 × 8 min à allure semi` | `--text-heading` 20/26, `--color-foreground-muted` `#A1A1AA`. **Jamais d'`opacity`** |
| Ligne 4 (méta) | `52 min   RPE cible 7   Course` | `--text-small`, `--color-foreground-subtle` |
| Ligne 5 | `Je l'ai comptée comme non réalisée après ton imprévu.` | `--text-small`, `--color-foreground-subtle` |
| Action | `Je l'ai faite quand même` | lien tertiaire `--text-small` sans 600 `--color-accent-text` `#A78BFA`, cible ≥ 44, gap 12 au-dessus. **Remplace** `Signaler un imprévu`, qui disparaît |

**Deux règles de préséance entre états**, à respecter strictement :

1. **(d) prime sur (b).** Une séance déplacée puis non réalisée affiche `NON RÉALISÉE`, pas
   `DÉPLACÉE` : c'est l'état terminal qui compte. Le motif `ancien → nouveau` est conservé sur la
   ligne 2, mais entièrement en `--color-foreground-subtle`.
2. **(c) prime sur (d).** Une séance annulée faute de créneau n'a jamais été attendue : elle reste en
   `ANNULÉE CETTE SEMAINE` et ne reçoit **jamais** le badge `NON RÉALISÉE`, même si un `session_log`
   `not_done` existe en base. Afficher les deux reviendrait à reprocher à l'utilisateur une séance
   que le coach a lui-même retirée.

**Distinction (c) / (d) sans couleur** : libellés de badge différents, ligne 5 différente, et (d) est
le **seul** des deux à porter une action. Un deutéranope les distingue sans la teinte.

**Aperçu Dashboard `D-planning-card`** : **aucun changement**. L'aperçu est glissant J → J+7, donc
tourné vers l'avenir ; un `not_done` porte toujours sur le passé. C'est `D-notdone-notice` (§3.1) qui
occupe ce rôle sur le Dashboard.

### 3.5 Accessibilité spécifique

- La carte `D-notdone-notice` est un `<section aria-labelledby>` pointant sur `D-notdone-title`.
  Elle **n'est pas** en `aria-live` : elle est présente au chargement, pas surgissante.
- `aria-label` des actions : `« Corriger : j'ai fait la séance Seuil du mardi 3 août »` et
  `« Confirmer que la séance Seuil du mardi 3 août n'a pas été réalisée »` — les libellés visibles
  seuls sont ambigus hors contexte.
- Carte (d) du planning : `aria-label` complet incluant l'état
  (`« Mardi 18 h 30, Seuil 3 × 8 minutes, comptée comme non réalisée après un imprévu »`).
- Résultat de la correction annoncé en `aria-live="polite"`, jamais `assertive`.
- Le badge `NON RÉALISÉE` est un texte, pas une icône : aucune information ne repose sur la teinte
  orange seule.

---

## 4. Livrable 4 — État « annulée » sans horaire d'origine (F3, question 18)

**Cas visé** : `placement.status = 'cancelled_week'`, `reason = 'no_slot_available'`, **et
`origin = null`** — la séance n'a jamais pu être placée dès le calcul initial (aucune fenêtre
disponible le jour d'intention du moteur, ni ailleurs dans la semaine ISO). Il n'existe donc **aucun**
horaire d'origine à afficher, alors que l'état (c) déjà construit
(`10-design-feature3-notes.md` §1.6) suppose toujours un `mar. 18h30 →`.

**Nœud à créer** : `P-session-card--cancelled-never-placed`, variante de
`P-session-card--cancelled`. À poser dans `8 — Planning semaine` et dans le frame de variantes
`8b — Planning semaine · états`.

### 4.1 Position de la carte

Sur le **jour d'intention du moteur** (`planned_sessions.scheduled_date`), qui existe toujours même
sans placement. La carte n'est donc jamais orpheline, et le groupe-jour qui la contient
(`MARDI 4`) porte déjà l'information de jour.

### 4.2 Rendu — delta par rapport à l'état (c)

Seules les lignes 2 et 5 changent. Tout le reste est **strictement identique** à
`10-design-feature3-notes.md` §1.6 (liseré `#3A3A3A` décoratif, badge, ligne 3 en
`--color-foreground-muted`, ligne 4 en `--color-foreground-subtle`, ligne 6, absence de bouton).

| Zone | État (c) — horaire d'origine connu | **Variante (c-bis) — jamais placée** |
| --- | --- | --- |
| Badge | `ANNULÉE CETTE SEMAINE` | **identique** |
| Ligne 2 | `mar. 18h30  →  Annulée` | **`Jamais placée  →  Annulée`** |
| Ligne 3 | intitulé, `--text-heading` `--color-foreground-muted` | identique |
| Ligne 4 | méta, `--color-foreground-subtle` | identique |
| Ligne 5 | `Aucun créneau disponible cette semaine.` | **`Aucun créneau ne permettait de la placer cette semaine.`** |
| Ligne 6 | `Elle n'est pas reportée à la semaine prochaine.` | identique — **toujours obligatoire** |
| Action | absente | absente |

Ligne 2, détail de style — **le motif « ancien → nouveau » est conservé** :
`Jamais placée` en `--text-small` 13/18 `--color-foreground-subtle` `#8B8B94` ; flèche `→`
`--color-foreground-subtle` ; `Annulée` en `--text-small` sans **600** `--color-warning` `#F59E0B`.

### 4.3 Pourquoi `Jamais placée` et non `Mardi → Annulée`

`08-architecture.md` §12 question 18 propose `Mardi → Annulée`. Je ne le retiens pas, pour une raison
de rendu et non de principe : **la carte vit déjà sous un label de groupe-jour `MARDI 4`**. Écrire
`Mardi → Annulée` juste en dessous n'apporte aucune information nouvelle et donne l'impression d'un
gabarit mal rempli. Dans l'état (c), c'est **l'heure** qui porte toute la valeur du membre gauche, pas
le jour — et c'est précisément elle qui manque ici.

`Jamais placée` :

- préserve la grammaire `ancien → nouveau` déjà établie sur `MqvfH` et reprise partout en F3, donc
  ne crée aucun gabarit d'exception ;
- **nomme le fait** au lieu de le laisser deviner : cette séance n'a pas été déplacée puis annulée,
  elle n'a jamais eu de créneau — ce sont deux histoires différentes, et l'AC4 exige que rien ne
  disparaisse silencieusement ;
- reste lisible hors contexte de groupe-jour (`aria-label`, résumés, lecture d'écran).

**Repli explicite** : si la carte devait un jour être rendue **hors** d'un groupe-jour, le membre
gauche redevient le jour d'intention (`Mardi  →  Annulée`), jamais une heure inventée.

### 4.4 Aperçu Dashboard `D-planning-card`

**Aucun nœud nouveau, aucune modification.** La règle déjà spécifiée en
`10-design-feature3-notes.md` §2.3 couvre le cas tel quel : ligne posée sur le jour d'intention,
colonne heure = `—` en `--color-foreground-subtle`, intitulé en `--color-foreground-subtle`,
badge `ANNULÉE`. Une séance jamais placée n'a pas plus d'heure qu'une séance annulée après coup :
la colonne heure rend déjà `—` dans les deux cas. C'est confirmé sur l'export réel de `jSZB0`
(ligne `VEN — Force bas du corps — 5 × 5   ANNULÉE`).

### 4.5 Accessibilité

- `aria-label` de la carte : `« Mardi 4 août, Seuil 3 × 8 minutes, annulée cette semaine : aucun
  créneau ne permettait de la placer. Elle n'est pas reportée à la semaine prochaine. »`
  Le mot `Annulée` et le motif de la ligne 5 sont dans le label : **la teinte orange n'ajoute rien
  qui ne soit déjà dit**.
- La flèche `→` est `aria-hidden` ; `Jamais placée` est du texte lu normalement.
- Contraste : `#8B8B94` sur `#1A1A1A` = 5,2:1 ✅ AA ; `#F59E0B` sur `#1A1A1A` = 8,1:1 ✅ AAA.
- Liseré `#3A3A3A` sur `#1A1A1A` = 1,3:1, sous le seuil 3:1 → **déclaré décoratif**, aucune
  information n'y repose (position déjà tenue en `10-design-feature3-notes.md` §5.3).

---

## 5. Design tokens utilisés — aucun token nouveau

**Couleurs** : `--color-background` `#0A0A0A` · `--color-surface` `#1A1A1A` ·
`--color-surface-raised` `#262626` · `--color-surface-sunken` `#141414` · `--color-border` `#262626` ·
`--color-border-strong` `#3A3A3A` · `--color-foreground` `#FFFFFF` · `--color-foreground-muted`
`#A1A1AA` · `--color-foreground-subtle` `#8B8B94` · `--color-foreground-on-accent` `#0A0A0A` ·
`--color-accent` / `--color-accent-text` `#A78BFA` · `--color-accent-hover` `#B9A3FB` ·
`--color-accent-subtle` `#241E3A` · `--color-success` `#4ADE80` · `--color-warning` `#F59E0B` ·
`--color-danger` `#F87171` (erreurs de formulaire et de réseau **uniquement**).

Aucun `#71717A`/`#52525B`, aucun `#8B5CF6` porteur de texte, aucun blanc sur violet.

**Typographie** : `--font-serif` (Playfair Display 700) réservé à `Tes activités.` (§1.2),
`Rien sur cette période.` (§1.9), `Repos aujourd'hui.` (§2.3). Partout ailleurs `--font-sans` :
`--text-display` 32/36 · `--text-title` 24/30 · `--text-heading` 20/26 · `--text-body` 15/24 ·
`--text-body-strong` 15/24 · `--text-button` 16/20 · `--text-small` 13/18 · `--text-caption` 12/16 ·
`--text-label` 11/14 `0.14em`. Aucune extension d'échelle.

**Espacements** : `space-2` 8 · `space-3` 12 · `space-4` 16 · `space-5` 20 (gouttière et padding de
carte) · `space-6` 24 · `space-8` 32 · `space-10` 40 · `space-12` 48.

**Rayons** : `--radius-md` 12 (blocs imbriqués, champs) · `--radius-lg` 16 (cartes) ·
`--radius-xl` 20 (feuille de période) · `--radius-full` (chips, pills, badges, liserés).

**Élévation** : aucune ombre ; profondeur par luminosité `#0A0A0A` → `#1A1A1A` → `#262626`.
Seule exception : `--shadow-overlay` sous la feuille de sélection de période.

**Glyphes de provenance** `↻` / `✎` : convention déjà établie (`docs/design-system.md`,
`09-design-feature2-notes.md` §2.2), 12 px `--color-foreground-subtle`, toujours `aria-hidden`,
toujours doublés d'un mot.

---

## 6. Règles d'accessibilité transverses appliquées

- **Contraste AA minimum** partout, valeurs vérifiées au §4.5 et dans `docs/design-system.md` §5.
- **La couleur n'est jamais seule porteuse** : badges textuels (`FUSIONNÉE`, `NON RÉALISÉE`,
  `ANNULÉE CETTE SEMAINE`), glyphes toujours doublés d'un mot, provenance écrite en toutes lettres
  dans le détail par source, états d'imprévu explicités par une phrase.
- **Focus visible** `outline: 2px solid #A78BFA; outline-offset: 2px` sur tout élément focusable ;
  outline **blanc** sur chip violette sélectionnée ; jamais supprimé sans remplacement.
- **Cibles tactiles ≥ 44 × 44** : chips 44, champs 52, pills 56, `✕` 44, tous les liens tertiaires.
- **Navigation clavier** : ordre DOM = ordre visuel ; chips en `radiogroup` navigables aux flèches ;
  feuilles (période) piégeant le focus et fermées par `Échap` ; `✕` premier focusable des sous-écrans.
- **Zones live** en `polite` uniquement : résultat de filtre, `unmerge`, enregistrement d'une séance
  hors plan, correction d'un `not_done`. Jamais `assertive` — le coach n'interrompt pas.
- **`prefers-reduced-motion`** : ouverture/fermeture de `S-offplan-block` et remplacement de
  `D-notdone-notice` sans animation, substitution instantanée.
- **Jamais d'`opacity`** pour signifier un état dégradé sur fond noir : on descend la couleur de
  texte d'un cran (`#FFFFFF` → `#A1A1AA` → `#8B8B94`).

---

## 7. Récapitulatif du travail à poser dans Pencil

### Frames à créer

| Frame | Dimensions | Contenu | §  |
| --- | --- | --- | --- |
| `9 — Détail par source` | 375 × ~1320 | écran complet, sous-écran sans tab bar | §1 |
| `7b — Séance du jour · hors plan` | 375 × ~1100 | cas B, bloc déplié + questions 1→5 renumérotées | §2.3 |
| `7c — Séance du jour · correction` | 375 × ~1200 | variante de `MqvfH`, Q1 pré-répondue `Oui` | §3.3 |

### Nœuds à créer dans des frames existants

| Frame | Nœud | Action | §  |
| --- | --- | --- | --- |
| `MqvfH` | `S-offplan-trigger` | lien tertiaire inséré entre la mention sous-CTA et la carte « Ce qui change cette semaine » | §2.2 |
| `MqvfH` | `S-offplan-block` | bloc imbriqué (état déplié, à poser en variante à côté) | §2.1 |
| `jSZB0` | `D-notdone-notice` | carte insérée entre `CoachPlanCard` et la carte Nutrition | §3.1 |
| `8 — Planning semaine` | `P-session-card--not-done` | 4ᵉ état de carte séance | §3.4 |
| `8 — Planning semaine` | `P-session-card--cancelled-never-placed` | variante de l'état (c) | §4 |
| `8b — Planning semaine · états` | les deux ci-dessus | ajoutés à la planche de variantes | §3.4, §4 |

### Nœuds à modifier

| Frame | Nœud | Action | §  |
| --- | --- | --- | --- |
| tous les frames à tab bar (`jSZB0`, …) | libellé du 4ᵉ onglet | `Profil` → **`Compte`** | Décision de nommage |
| `F2-compte-extrait` (si déjà posé sous le nom `F2-profil-extrait`) | nom du frame + titre de header | `PROFIL` → `MON COMPTE` | Décision de nommage |
| `jSZB0` | CTA de `CoachPlanCard` | libellé conditionnel `Enregistrer une séance` quand aucune séance n'est prévue | §2.3 |

### Ne pas toucher

`D-data-card` et ses cellules · `D-planning-card` et le bloc verrouillé `R8syr`/`LBMdV` ·
`C-source-*` de l'écran Connexion données · `S-score-*` de l'écran Score hybride ·
le bloc de calibration orange · les écrans F1 `tqUVI`, `SgNdU`, `qFZLF`, `Yf6zY`.

---

## 8. Questions renvoyées à `architect` / `spec-writer`

1. **Distinguer un `not_done` automatique d'un `not_done` déclaré** (§3.1). `D-notdone-notice` ne doit
   jamais s'afficher pour un `not_done` que l'utilisateur a lui-même saisi. Aucun champ ne porte
   aujourd'hui cette distinction. Propriétaire : `architect`.
2. **Acquitter un `not_done` sans modifier la donnée** (§3.1, action `C'est exact`). Il faut un
   marqueur d'accusé de réception, sur le modèle de `plan_diffs.acknowledged_at`.
   Propriétaire : `architect`.
3. **`ActivityFeedItem` doit exposer le nom de source affichable** (`Strava`, `Saisie manuelle`) et
   l'`id` du log absorbé pour le lien `Séparer les deux` (§1.6, §1.7). À vérifier contre le type réel.
   Propriétaire : `architect`.
4. **Ordre des cartes du Dashboard** (§0.bis) : la maquette et `08-architecture.md` §14.4 divergent.
   À aligner dans un sens ou dans l'autre. Propriétaire : `architect` + `designer`.
5. **Règle de préséance (c) > (d) > (b)** (§3.4) : décision de design, à refléter côté serveur pour
   que la vue de placement ne remonte pas deux états concurrents. Propriétaire : `architect`.
6. **Champ imbriqué dans un bloc `raised`** (§2.1) : la dérogation « le champ descend d'un cran de
   luminosité au lieu de monter » est à entériner dans `docs/design-system.md` §4.6.
   Propriétaire : `designer` (prochaine révision de la charte).
7. **Tab bar absente du code** (`08-architecture.md` §12 question 20) : non tranché ici, hors mission.
   La décision de nommage « Compte » s'applique quel que soit l'arbitrage.
