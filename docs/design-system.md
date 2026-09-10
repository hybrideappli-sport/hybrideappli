# Design System — Hybride Club (v1)

Charte graphique officielle, formalisée à partir des **maquettes Pencil validées** (fichier
`~/.pencil/documents/b0463ce3-9203-4fdb-9912-59cb8c46d8ed/pencil-new.pen`), recalée avec le **logo
réel** (monogramme X/sablier blanc sur noir) et corroborée par le prototype Lovable.

Écrans de référence inspectés :

| Node   | Écran                                        |
| ------ | -------------------------------------------- |
| `tqUVI`| Onboarding profil — chat coach IA            |
| `SgNdU`| Onboarding — disclaimer « Je ne suis pas un médecin » |
| `qFZLF`| Onboarding — consentement RGPD santé         |
| `jSZB0`| Dashboard accès libre — plan du jour          |
| `MqvfH`| Séance/Repas du jour — saisie 4+2 signaux     |
| `Yf6zY`| Paiement abonnement / paywall                 |
| `SHhZ3`| Composant `LogoHybride` (placeholder « H »)   |

> **Portée** : thème **sombre unique**. Aucune bascule light/dark : toutes les maquettes sont
> conçues 100 % dark, le token `--background` est donc constant et le bloc
> `@media (prefers-color-scheme: dark)` actuel de `globals.css` doit disparaître.

> **Note de méthode / fiabilité des valeurs** — l'outillage Pencil disponible dans cette session
> exposait uniquement `get_screenshot` et `export_nodes` (pas d'accès `execute`/`GetVariables` pour
> lire les fills en base). Les hex ci-dessous ont donc été relevés sur les **exports PNG 2×** des
> écrans, qui alignent très exactement la palette Tailwind (violet-400/500, zinc, emerald-400,
> blue-400, amber-500). Ils sont fidèles au rendu ; si un jour l'accès base est possible,
> re-vérifier les 3 valeurs les plus sensibles : `--color-accent`, `--color-surface`,
> `--color-surface-raised`. **Les corrections d'accessibilité de la §5 priment sur le relevé brut.**

---

## 1. Couleurs

### 1.1 Fonds et surfaces

| Token                    | Hex       | Usage observé                                                       |
| ------------------------ | --------- | ------------------------------------------------------------------- |
| `--color-background`     | `#0A0A0A` | Fond de tous les écrans (quasi-noir, jamais `#000` pur)              |
| `--color-surface`        | `#1A1A1A` | Cartes principales (carte « Plan du jour », « Offre unique », bulles coach) |
| `--color-surface-raised` | `#262626` | Bloc imbriqué dans une carte (« POURQUOI CETTE SÉANCE »), champs de formulaire, chips non sélectionnées |
| `--color-surface-sunken` | `#141414` | Barre d'onglets basse, en-tête sticky                                |
| `--color-border`         | `#262626` | Bordures très discrètes (séparateurs de rows, contour d'input)       |
| `--color-border-strong`  | `#3A3A3A` | Contour de badge outline, piste de barre de progression              |

Les cartes n'ont **pas de bordure visible ni d'ombre** : la hiérarchie se fait uniquement par
l'écart de luminosité fond → carte → bloc imbriqué (`#0A0A0A` → `#1A1A1A` → `#262626`).

### 1.2 Texte

| Token                     | Hex       | Usage                                                              |
| ------------------------- | --------- | ------------------------------------------------------------------ |
| `--color-foreground`      | `#FFFFFF` | Titres serif, valeurs de métriques, questions, texte de bulle       |
| `--color-foreground-muted`| `#A1A1AA` | Corps de texte secondaire, sous-titres, labels de champs, options non sélectionnées |
| `--color-foreground-subtle`| `#8B8B94`| Texte d'aide, mentions légales, placeholders, labels majuscules gris — **valeur corrigée**, voir §5 |
| `--color-foreground-on-accent` | `#0A0A0A` | Texte sur bouton/pill violet (le violet est clair : texte noir, jamais blanc) |

### 1.3 Accent de marque (violet)

| Token                    | Hex       | Usage                                                              |
| ------------------------ | --------- | ------------------------------------------------------------------ |
| `--color-accent`         | `#A78BFA` | **Remplissage** : bouton primaire, chip sélectionnée, bulle utilisateur, checkbox cochée, icône d'onglet actif, barre de progression |
| `--color-accent-hover`   | `#B9A3FB` | Survol du bouton primaire (éclaircir, ne pas foncer : le CTA est déjà clair sur fond noir) |
| `--color-accent-pressed` | `#8B5CF6` | État pressé / actif du bouton primaire                              |
| `--color-accent-text`    | `#A78BFA` | **Texte** violet sur fond sombre : « En savoir plus → », « PLAN DU JOUR · COACH IA », compteur « 3 / 6 », valeur « 8 / 10 », libellé d'onglet actif |
| `--color-accent-subtle`  | `#241E3A` | Fond très léger teinté violet (badge/état informatif) — usage optionnel |

⚠️ Dans les maquettes, certains textes violets sont rendus en `#8B5CF6` (violet-500). Sur carte
`#1A1A1A` ce ton tombe à **4,12:1** et échoue WCAG AA. La charte fixe donc **un seul violet de
texte : `#A78BFA`** (§5). `#8B5CF6` est réservé aux **remplissages** (état pressé, piste remplie).

Le bouton primaire est **plat**, pas en dégradé, dans les maquettes Pencil (le prototype Lovable
montrait un dégradé diagonal violet-400→600). Arbitrage : **on garde le violet plat de Pencil**
comme référence ; un dégradé reste une option décorative pour une future landing, jamais pour les
composants produits.

### 1.4 Couleurs sémantiques

| Token                | Hex       | Usage observé                                                        |
| -------------------- | --------- | --------------------------------------------------------------------- |
| `--color-success`    | `#4ADE80` | « Récupération · stable », « FC repos · −2 bpm », puces de la liste d'avantages du paywall, puce « Fréquence cardiaque », valeur en hausse favorable (« 320 g ») |
| `--color-info`       | `#60A5FA` | « Charge · +8 % vs S-1 », puces « Sommeil » / « Poids », marque de carte « VISA » |
| `--color-warning`    | `#F59E0B` | Domaine douleur/gêne : pill « Gêne légère », « Oui, aussi au repos », label « JE N'AI PAS BIEN COMPRIS », puce « Douleur et gêne », valeurs en baisse (« 38 km », « 2 ») |
| `--color-danger`     | `#F87171` | Erreurs de formulaire, retrait de consentement (non présent dans les 7 écrans inspectés — valeur normative) |

Sémantique de couleur métier à respecter par le développeur : **vert = récupération / cardio**,
**bleu = charge, sommeil, données quantitatives**, **orange = douleur, gêne, alerte de charge**,
**violet = coach IA & actions**. Ne jamais utiliser le vert/rouge en « bon/mauvais » sur des
signaux de douleur.

---

## 1.5 Couleurs de carte

> Ajouté par `developer` en lot L3 d'ADR-018 (« Carte des tracés outdoor »), conformément à
> `docs/design-carte.md` §9 (« bloc à insérer par `developer` en L3 »). Famille **dédiée**, hors
> palette sémantique — ADR-018, question ouverte n°3, tranchée par `designer` le 2026-09-09.
> Justification complète des teintes, des contrastes WCAG et du choix de motif : `docs/design-carte.md`
> §2. Ces quatre tokens ne vivent que dans le canevas de `/carte` — ils ne remplacent ni ne recoupent
> les couleurs sémantiques de §1.4.

| Token | Sport | Hex | Motif de trait (2ᵉ canal) |
| ----- | ----- | --- | -------------------------- |
| `--color-map-route` | Route | `#22D3EE` | plein |
| `--color-map-trail` | Trail | `#F472B6` | tirets courts |
| `--color-map-hike`  | Rando | `#E4E4E7` | pointillé rond |
| `--color-map-bike`  | Vélo  | `#FDE047` | tirets longs |
| `--color-map-casing` | — | `#0A0A0A` | halo/liseré sous tout tracé (`--color-background` réexposé) |
| `--color-map-selected-casing` | — | `#FFFFFF` | halo du tracé sélectionné (un seul à la fois) |

**Contrainte d'implémentation** : MapLibre n'interprète pas les variables CSS ci-dessus (ses
propriétés `paint`/`layout` attendent des littéraux). La source unique consommée par les couches
MapLibre est `apps/web/lib/map/map-tokens.ts` ; ces variables CSS restent actives pour que la charte
reste complète et lisible, et `apps/web/lib/map/map-tokens.test.ts` vérifie leur égalité littérale
avec le module TypeScript, pour qu'un changement d'un seul côté ne passe jamais inaperçu.

---

## 2. Typographie

### 2.1 Familles

| Token          | Valeur                                                            | Usage |
| -------------- | ----------------------------------------------------------------- | ----- |
| `--font-serif` | `"Playfair Display", "Source Serif 4", Georgia, serif`             | Titres éditoriaux uniquement : « Bonjour Thomas. », « Ton coach, sans limite. », « Je ne suis pas un médecin. », « Tes données de santé. », « Seuil, 3 × 8 min. », « Ce qui change cette semaine. », prix « 19 € » |
| `--font-sans`  | `"Inter", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif` | Tout le reste : corps, labels, valeurs de métriques, boutons, champs, navigation |

Le pairing serif/sans observé dans Pencil est identique à celui décrit pour Lovable : **serif
gras à fort contraste (didone) pour la voix éditoriale du coach, sans-serif neutre pour l'interface**.
Charger via `next/font/google` (Playfair Display 700 uniquement, Inter 400/500/600/700) et
supprimer Geist de `layout.tsx`.

Règle d'or : le serif ne sert **jamais** à un bouton, un label, un champ ou une donnée chiffrée
en ligne — sauf le prix du paywall, qui est un titre.

### 2.2 Échelle

Base 375 pt (mobile-first). Toutes les valeurs sont en px.

| Token                | Taille / Interligne | Famille + graisse      | Usage                                                                 |
| -------------------- | ------------------- | ---------------------- | --------------------------------------------------------------------- |
| `--text-display`     | 32 / 36             | serif 700              | Titre d'écran : « Bonjour Thomas. », « Ton coach, sans limite. »       |
| `--text-title`       | 24 / 30             | serif 700              | Titre de carte éditoriale : « Je ne suis pas un médecin. », « Seuil, 3 × 8 min. » |
| `--text-heading`     | 20 / 26             | sans 600               | Titre fonctionnel : « Seuil — 3 × 8 min à allure semi », « 2 620 kcal · P 165 g … » |
| `--text-metric`      | 22 / 26             | sans 700               | Valeur de métrique : « 412 UA », « 68 % », « 7 h 05 », « 48 bpm »       |
| `--text-question`    | 16 / 22             | sans 600               | Questions numérotées : « 2 · RPE ressenti »                            |
| `--text-body`        | 15 / 24             | sans 400               | Corps courant, bulles de chat, explications du coach                   |
| `--text-body-strong` | 15 / 24             | sans 600               | Lien inline « En savoir plus → », options sélectionnées                |
| `--text-button`      | 16 / 20             | sans 600               | Libellé de bouton primaire/secondaire                                  |
| `--text-small`       | 13 / 18             | sans 400               | Méta de séance (« 52 min », « RPE cible 7 »), bornes d'échelle, aide sous champ |
| `--text-caption`     | 12 / 16             | sans 400               | Mentions légales, disclaimers de bas d'écran                           |
| `--text-label`       | 11 / 14, `0.14em`, `uppercase` | sans 600 | Labels de section trackés : « PLAN DU JOUR · COACH IA », « MES DONNÉES · 7 DERNIERS JOURS », « PAIEMENT », « ÉTAPE 3 · TON HISTORIQUE » |

Le `--text-label` est une **signature forte de la charte** : petit, majuscule, très tracké, en
`--color-foreground-subtle` (gris) ou `--color-accent-text` (violet) quand il qualifie une sortie du
coach IA.

---

## 3. Espacements, rayons, élévation

### 3.1 Échelle d'espacement (base 4)

| Token       | px | Usage type                                                            |
| ----------- | -- | ---------------------------------------------------------------------- |
| `space-1`   | 4  | Gap icône/texte serré                                                  |
| `space-2`   | 8  | Gap intra-composant (label ↔ valeur)                                   |
| `space-3`   | 12 | Gap entre chips d'une même ligne, padding vertical de chip             |
| `space-4`   | 16 | **Gap standard entre cartes**, padding d'un bloc imbriqué              |
| `space-5`   | 20 | **Padding horizontal d'écran**, padding interne de carte               |
| `space-6`   | 24 | Espace entre groupes de questions                                      |
| `space-8`   | 32 | Espace entre sections majeures d'un écran                              |
| `space-10`  | 40 | Respiration au-dessus du titre display                                 |
| `space-12`  | 48 | Marge basse avant la tab bar                                           |

Gouttière d'écran : **20 px** à gauche et à droite. Grille de métriques : 2 colonnes, gap 16 px
horizontal / 20 px vertical.

### 3.2 Rayons

| Token           | px    | Usage                                                          |
| --------------- | ----- | --------------------------------------------------------------- |
| `--radius-sm`   | 8     | Checkbox, petits badges carrés, puce d'onglet                    |
| `--radius-md`   | 12    | Bloc imbriqué dans une carte, champ de formulaire, select        |
| `--radius-lg`   | 16    | **Carte** (plan du jour, nutrition, données, offre), bulle de chat |
| `--radius-xl`   | 20    | Grande carte d'offre / conteneur de section                      |
| `--radius-full` | 9999  | **Bouton primaire et secondaire, chips de réponse, badges, champ de saisie du chat, bouton d'envoi rond, barre de progression** |

Le logo est posé dans une tuile blanche à rayon **10 px** (squircle léger, jamais un cercle).

### 3.3 Élévation

Aucune ombre portée dans les maquettes. La profondeur passe par la luminosité de surface.
Une seule exception admise : `--shadow-overlay: 0 -8px 24px rgba(0,0,0,0.6)` sous la tab bar et
sous une barre d'action collée en bas, pour détacher du contenu qui défile.

---

## 4. Composants clés

### 4.1 Bouton primaire

- Fond `--color-accent` (`#A78BFA`), **plat**, texte `--color-foreground-on-accent` (`#0A0A0A`),
  `--text-button` (sans 600, 16 px).
- Forme **pill** : `border-radius: 9999px`, hauteur **56 px**, padding horizontal 24 px.
- Largeur : **100 % de la colonne** dans tous les écrans inspectés (CTA d'onboarding, « Voir ma
  séance du jour », « Enregistrer », « Payer et activer mon abonnement »).
- États : `hover` → `--color-accent-hover` ; `active` → `--color-accent-pressed` ;
  `focus-visible` → anneau 2 px `--color-accent` + offset 2 px sur `--color-background` ;
  `disabled` → fond `#2E2A3A`, texte `--color-foreground-subtle`, `cursor: not-allowed`
  (opacité 50 % interdite : illisible sur fond noir) ; `loading` → spinner 16 px couleur
  `--color-foreground-on-accent`, libellé conservé, bouton `aria-busy="true"`.

**Impact `apps/web/components/ui/button.tsx`** : remplacer `rounded-md` → `rounded-full`,
`text-sm font-medium` → `text-base font-semibold`, `bg-orange-400 text-white hover:bg-orange-500`
→ `bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed`, l'anneau
`focus-visible:ring-orange-400` → `focus-visible:ring-accent`, `disabled:opacity-50` → variante
disabled explicite ci-dessus. Tailles : `default` h-14 (56), `sm` h-11 (44), `lg` h-14 px-8 ;
toutes en `rounded-full`.

### 4.2 Bouton secondaire / tertiaire

- **Secondaire (lien plein largeur)** : pas de fond, pas de bordure, texte
  `--color-foreground-muted` en `--text-button`, centré sous le CTA principal
  (« Continuer en accès libre », « Continuer sans ces données »). Hover → `#FFFFFF`.
- **Ghost/chip neutre** : fond `--color-surface-raised`, texte `--color-foreground-muted`,
  `--radius-full`, hauteur 44 px (« 5 à 6 au total », « 5 à 6 de course »).
- **Lien inline** : `--color-accent-text` en sans 600 + flèche `→`, souligné au hover
  (« En savoir plus → »).

### 4.3 Carte

- Fond `--color-surface` (`#1A1A1A`), `--radius-lg` (16), padding 20 px, **pas de bordure, pas
  d'ombre**, gap vertical 16 px entre cartes.
- Bloc imbriqué (explication du coach) : fond `--color-surface-raised` (`#262626`),
  `--radius-md` (12), padding 16 px.
- Structure canonique : `--text-label` (violet ou gris) → titre → méta ligne `--text-small` →
  contenu → CTA.

**Impact `apps/web/components/ui/card.tsx`** : `rounded-xl border border-neutral-200 bg-white
text-neutral-900 shadow-sm` → `rounded-2xl bg-surface text-foreground` (aucune bordure, aucune
ombre) ; paddings `p-6` → `p-5` ; `CardDescription` `text-neutral-500` →
`text-foreground-muted` ; ajouter un `CardLabel` rendant le `--text-label`.

### 4.4 Chips de réponse (signaux 4+2)

Groupe de 2 à 5 options exclusives, disposées en ligne, hauteur 44 px, `--radius-full`,
padding horizontal 20 px, `--text-body-strong`.

| État              | Fond                     | Texte                        |
| ----------------- | ------------------------ | ---------------------------- |
| non sélectionné   | transparent              | `--color-foreground-muted`   |
| survol            | `--color-surface-raised` | `#FFFFFF`                    |
| sélectionné       | `--color-accent`         | `--color-foreground-on-accent` |
| sélectionné (domaine douleur) | `--color-warning` | `--color-foreground-on-accent` |
| désactivé         | transparent              | `--color-foreground-subtle`  |

Sémantique confirmée par `MqvfH` : la sélection dans le domaine **douleur/gêne** bascule en orange,
pas en violet. Implémenter en `role="radiogroup"` + `role="radio" aria-checked`, pas en boutons nus.

### 4.5 Badges / pills d'information

Contour fin 1 px `--color-border-strong` ou coloré par contexte, fond transparent, texte
`--text-label` (11 px majuscule tracké) de la même couleur que le contour, `--radius-full`,
padding 4 px / 10 px. Variantes : `accent` (violet), `warning` (orange), `neutral` (gris).

### 4.6 Champs de formulaire

- Fond `--color-surface-raised` (`#262626`), **pas de bordure au repos**, `--radius-md` (12),
  hauteur 52 px, padding horizontal 16 px, texte `--text-body` blanc.
- Label au-dessus : `--text-small` `--color-foreground-muted`, gap 8 px.
- Placeholder : `--color-foreground-subtle`.
- `focus-visible` : anneau 2 px `--color-accent` (l'input ne change pas de fond).
- `error` : bordure 1 px `--color-danger` + message `--text-small` `--color-danger` sous le champ,
  lié par `aria-describedby` et `aria-invalid="true"`.
- Champ de saisie du chat : même fond mais `--radius-full`, accompagné d'un bouton d'envoi rond
  48 px fond `--color-accent`, icône flèche `--color-foreground-on-accent`.
- Select : même boîte + chevron `--color-foreground-muted` à droite.
- **Champ imbriqué dans un bloc `--color-surface-raised` déjà présent** (ex. formulaire rapide dans un
  bloc conditionnel type « POURQUOI PARTIELLEMENT ? ») : la règle générale s'inverse — le champ
  **descend** d'un cran de luminosité à `--color-surface` (`#1A1A1A`) au lieu de monter, pour rester
  visible sur son fond. Ajouté le 2026-08-12 (`11-design-notes.md` §2.1, écran Séance hors plan).

### 4.7 Checkbox de consentement

Carré 24 px, `--radius-sm` (8). Non cochée : fond transparent, bordure 1,5 px
`--color-border-strong`. Cochée : fond `--color-accent`, coche `--color-foreground-on-accent`.
Libellé à droite en `--text-body` blanc, zone cliquable ≥ 44 px de haut.

### 4.8 Barre de progression

Piste `--color-border-strong` hauteur 4 px `--radius-full` ; remplissage `--color-accent`.
Progression d'onboarding : collée sous le header, pleine largeur, sans rayon aux extrémités
d'écran. Curseur RPE : même barre + valeur « 8 / 10 » en `--color-accent-text` à droite.
Toujours `role="progressbar"` avec `aria-valuenow/min/max`, ou `role="slider"` si interactif.

### 4.9 Tab bar

Fond `--color-surface-sunken` (`#141414`), 4 items, icône 24 px + libellé `--text-small`.
Actif : icône et libellé `--color-accent-text`. Inactif : `--color-foreground-subtle`.
Hauteur 64 px + safe area. `aria-current="page"` sur l'item actif.

### 4.10 Bulles de chat (coach IA)

- Coach : fond `--color-surface` (`#1A1A1A`), texte blanc, `--radius-lg` 16 px (coin bas-gauche
  4 px), largeur max 80 %, aligné à gauche.
- Utilisateur : fond `--color-accent`, texte `--color-foreground-on-accent`, `--radius-lg`
  (coin bas-droit 4 px), aligné à droite.
- Bulle de reformulation : bulle coach + `--text-label` orange en tête
  (« JE N'AI PAS BIEN COMPRIS »).
- Typing : bulle coach à 3 points `--color-foreground-subtle`, texte « Le coach écrit… »,
  annoncé via `aria-live="polite"`.

### 4.11 États d'écran

- **loading** : squelettes fond `--color-surface-raised`, `--radius-md`, pas de spinner plein écran.
- **empty** : `--text-title` serif + phrase `--text-body` `--color-foreground-muted` + CTA primaire.
- **error** : carte fond `--color-surface`, `--text-label` `--color-danger`, message + bouton
  secondaire « Réessayer ».
- **quota atteint** : le contenu reste visible, l'action bascule vers le CTA d'abonnement
  (cf. `Yf6zY`) — ne jamais griser tout l'écran.

---

## 5. Accessibilité

Contrastes calculés (WCAG 2.1) sur `--color-background` `#0A0A0A` et sur `--color-surface` `#1A1A1A`.

| Paire                                  | sur `#0A0A0A` | sur `#1A1A1A` | Verdict AA (4.5) |
| -------------------------------------- | ------------- | ------------- | ---------------- |
| `#FFFFFF` texte                        | 19,6:1        | 17,3:1        | ✅ AAA           |
| `#A1A1AA` (`foreground-muted`)         | 7,8:1         | 6,8:1         | ✅ AAA           |
| `#8B8B94` (`foreground-subtle`)        | 5,9:1         | 5,2:1         | ✅ AA            |
| `#71717A` (gris zinc-500 des maquettes)| **4,1:1**     | **3,6:1**     | ❌ **échec**     |
| `#52525B` (gris le plus sombre observé)| **2,9:1**     | **2,6:1**     | ❌ **échec**     |
| `#A78BFA` (`accent-text`)              | 7,3:1         | 6,4:1         | ✅ AAA           |
| `#8B5CF6` (violet-500 en texte)        | 4,7:1         | **4,1:1**     | ❌ échec sur carte |
| `#0A0A0A` sur bouton `#A78BFA`         | 7,3:1         | —             | ✅ AAA           |
| `#4ADE80` (succès)                     | 11,4:1        | 10,0:1        | ✅ AAA           |
| `#60A5FA` (info)                       | 7,8:1         | 6,9:1         | ✅ AAA           |
| `#F59E0B` (warning) / noir sur warning | 9,2:1 / 9,2:1 | 8,1:1         | ✅ AAA           |

### Écarts constatés et corrections imposées

1. **Gris trop sombres dans les maquettes.** Plusieurs textes secondaires (mentions « Calibration en
   cours — 2 semaines sur 4… », « Un signal négatif peut faire baisser ta charge… », placeholder
   « Ta réponse… », « Paiement sécurisé… ») sont rendus autour de `#71717A`/`#52525B` et **échouent
   WCAG AA**. → **Correction** : plancher de gris à `#8B8B94` (`--color-foreground-subtle`). Aucun
   texte ne descend en dessous. Les gris plus sombres restent autorisés uniquement pour des
   **éléments non textuels décoratifs**.
2. **Violet-500 en texte sur carte.** `#8B5CF6` sur `#1A1A1A` = 4,12:1. → **Correction** :
   `--color-accent-text` = `#A78BFA` partout où le violet porte du texte (labels de section,
   « En savoir plus », compteurs, libellé d'onglet actif). `#8B5CF6` reste réservé aux
   remplissages non textuels et à l'état `pressed`.
3. **Texte sur CTA violet** : toujours `#0A0A0A`. Le blanc sur `#A78BFA` donnerait 2,7:1 → interdit.

### Règles transverses

- **Focus visible obligatoire** : `outline: 2px solid #A78BFA; outline-offset: 2px` sur tout élément
  focusable. Ne jamais supprimer l'outline sans remplacement. Le focus doit rester visible sur les
  chips violettes (utiliser alors un outline blanc 2 px).
- **Cibles tactiles** ≥ 44 × 44 px (chips 44, boutons 56, checkbox zone étendue).
- **La couleur n'est jamais le seul porteur d'information** : les chips sélectionnées portent
  `aria-checked`, les variations de métriques portent le signe (`+8 %`, `−2 bpm`) et pas seulement
  la teinte, les puces colorées du consentement sont doublées du libellé.
- **Labels ARIA** : chaque groupe de signaux a un `aria-labelledby` pointant sur sa question
  numérotée ; le slider RPE expose `aria-valuetext="8 sur 10"` ; le bouton d'envoi du chat a
  `aria-label="Envoyer ma réponse"`.
- **Navigation clavier** : ordre DOM = ordre visuel ; groupes de chips navigables aux flèches
  (pattern radiogroup) ; la modale de paywall piège le focus et se ferme à `Échap`.
- **Zones live** : réponses du coach et messages d'erreur en `aria-live="polite"` ;
  jamais `assertive` (le coach n'interrompt pas la saisie).
- **Contenu sensible** : le disclaimer médical (`SgNdU`) et le consentement santé (`qFZLF`) ne sont
  jamais désactivés visuellement seulement ; le CTA bloqué expose `aria-disabled="true"` + un
  message texte explicite (« Tu dois cocher la case pour continuer. ») lié en `aria-describedby`.
- **Mouvement** : respecter `prefers-reduced-motion` (typing indicator et transitions de chips
  réduits à une apparition sans animation).

---

## 6. Logo

Le logo réel est un **monogramme géométrique en X / sablier**, blanc plein sur fond noir, à formes
**anguleuses et nettes** (pointes droites, aucune extrémité arrondie) — source :
`~/Desktop/HYBRIDE/Capture d’écran 2026-04-10 à 00.46.10.png`.

### État actuel — action requise

Le composant Pencil `SHhZ3` (`LogoHybride`) contient encore un **placeholder « H » sérif** dans une
tuile blanche. Il apparaît dans le header de **tous** les écrans (`tqUVI`, `SgNdU`, `qFZLF`,
`jSZB0`, `MqvfH`, `Yf6zY`). Le remplacement par le vrai monogramme n'a **pas** pu être effectué :
l'outillage Pencil disponible dans cette session était en lecture seule (`get_screenshot`,
`export_nodes` uniquement, pas d'`execute`). → **À faire par le prochain intervenant disposant de
l'accès en écriture Pencil** : substituer le glyphe « H » par le tracé du monogramme, sans changer
la géométrie du conteneur décrite ci-dessous. Le développeur, lui, intègre directement le vrai logo
(le placeholder ne doit jamais arriver dans le code).

### Spécification d'usage (déduite des maquettes)

| Contexte                     | Rendu                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| Header d'application         | Tuile **blanche** 40 × 40 px, rayon 10 px, monogramme **noir** `#0A0A0A` centré, hauteur de glyphe ≈ 20 px (50 % de la tuile) |
| Sur fond noir sans tuile     | Monogramme **blanc** `#FFFFFF` directement sur `--color-background`     |
| Sur fond violet (`#A78BFA`)  | Monogramme `#0A0A0A`                                                    |
| Splash / favicon             | Monogramme blanc sur `#0A0A0A`, format carré, marge interne 25 %       |

- **Zone de protection** : marge libre minimale de **50 % de la largeur du monogramme** sur les
  quatre côtés (dans le header, le glyphe occupe la moitié de sa tuile 40 px → 10 px de marge
  interne, et 16 px séparent la tuile du wordmark « HYBRIDE CLUB »).
- **Taille minimale** : 24 px de côté (en dessous, le X se referme visuellement).
- **Wordmark** : « HYBRIDE CLUB » en sans 600, `--text-label` (11 px, `0.14em`, majuscules),
  `--color-foreground-muted`, aligné verticalement au centre de la tuile.
- **Interdits** : ne pas arrondir les angles du monogramme, ne pas le recolorer en violet, ne pas
  l'inscrire dans un cercle, ne pas l'étirer, ne pas ajouter d'ombre ni de contour.
- **Formats à produire** dans `apps/web/public/assets/brand/` : `logo-mark.svg` (monogramme seul,
  `currentColor`), `logo-lockup.svg` (monogramme + wordmark), `favicon.svg`, `icon-512.png`,
  `apple-touch-icon.png` (fond `#0A0A0A`).

---

## 7. Implémentation Tailwind v4 — bloc de référence

À intégrer dans `apps/web/app/globals.css` **en remplacement intégral** du contenu actuel
(le bloc `@media (prefers-color-scheme: dark)` disparaît : thème sombre unique).

```css
@import "tailwindcss";

:root {
  color-scheme: dark;

  /* Surfaces */
  --background: #0a0a0a;
  --surface: #1a1a1a;
  --surface-raised: #262626;
  --surface-sunken: #141414;
  --border-subtle: #262626;
  --border-strong: #3a3a3a;

  /* Texte */
  --foreground: #ffffff;
  --foreground-muted: #a1a1aa;
  --foreground-subtle: #8b8b94;
  --foreground-on-accent: #0a0a0a;

  /* Accent */
  --accent: #a78bfa;
  --accent-hover: #b9a3fb;
  --accent-pressed: #8b5cf6;
  --accent-subtle: #241e3a;

  /* Sémantique */
  --success: #4ade80;
  --info: #60a5fa;
  --warning: #f59e0b;
  --danger: #f87171;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-surface-sunken: var(--surface-sunken);
  --color-border-subtle: var(--border-subtle);
  --color-border-strong: var(--border-strong);

  --color-foreground: var(--foreground);
  --color-foreground-muted: var(--foreground-muted);
  --color-foreground-subtle: var(--foreground-subtle);
  --color-on-accent: var(--foreground-on-accent);

  --color-accent: var(--accent);
  --color-accent-hover: var(--accent-hover);
  --color-accent-pressed: var(--accent-pressed);
  --color-accent-subtle: var(--accent-subtle);

  --color-success: var(--success);
  --color-info: var(--info);
  --color-warning: var(--warning);
  --color-danger: var(--danger);

  --font-sans: var(--font-inter), -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-serif: var(--font-playfair), "Source Serif 4", Georgia, serif;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
}
```

Rappels d'intégration pour `developer` :

- charger Playfair Display (700) et Inter (400/500/600/700) via `next/font/google` dans
  `layout.tsx`, exposer `--font-playfair` et `--font-inter`, retirer Geist ;
- classe utilitaire `.text-label` pour le style majuscule tracké (11 px / `0.14em` / 600) ;
- aucune valeur hex en dur dans les composants : uniquement les classes issues de `@theme inline`.
