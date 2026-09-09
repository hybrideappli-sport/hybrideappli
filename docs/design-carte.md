# Design — Écran Carte (phase 1, lecture seule)

- **Statut** : proposé — livrable `designer`
- **Date** : 2026-09-06
- **Répond à** : ADR-018, **question ouverte n°3** (« teintes des quatre tokens `--color-map-*`, et rendu
  d'un chemin multi-sports »). **Débloque le lot L3.**
- **Dépend de** : `docs/design-system.md` (charte v1), ADR-018 §5 (classement), §6 (contrat de la route),
  §9 (attribution ODbL)
- **Ne modifie pas** : `docs/design-system.md`. L'ajout effectif des tokens à la charte est un travail
  `developer` en L3 (§9 de ce document donne le bloc exact à insérer).

> **Méthode et fiabilité des valeurs.** Aucune maquette Pencil n'a été produite ni ouverte pour ce
> document : il ne contient donc **aucune valeur de token Pencil**. Toutes les valeurs proviennent de
> trois sources vérifiables — (a) `docs/design-system.md`, (b) le **style `alidade_smooth_dark` réel**,
> lu le 2026-09-06 sur `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json`, (c) les ratios de
> contraste WCAG 2.1 calculés à la main à partir de ces hex (formule de luminance relative, `(L1+0,05)/(L2+0,05)`).
> Les valeurs de luminance intermédiaires sont données en §2.2 pour être re-vérifiables.

---

## 1. Ce que le fond de carte impose réellement

Le style sombre de la phase 1 n'est **pas un fond plat**. Valeurs relevées dans le style :

| Élément du style | Couleur déclarée | Couleur effective composée |
| ---------------- | ---------------- | -------------------------- |
| Fond général (`background`) | `hsl(0, 0%, 20%)` | **`#333333`** |
| Eau | `#222222` | `#222222` |
| Bâti | `hsl(95, 5%, 22%)` | `#363630` |
| Parcs / landcover | `hsla(120, 23%, 55%, 8%)` | ≈ `#343834` (8 % sur `#333`) |
| Remplissage de voirie | `hsla(60, 1%, 16%, 90%)` | ≈ `#2A2A29` |
| **Contour de voirie (le plus clair)** | `hsla(0, 0%, 30%, 80%)` | **≈ `#484848`** |
| Étiquettes de texte | `#999` → `#d4d4dc` | texte, pas surface |

Deux conclusions structurent tout le reste :

1. **La surface la plus claire qu'un tracé peut traverser est `#484848`** (contour de voirie), pas `#333333`.
   C'est cette valeur qui sert de pire cas dans les calculs de §2. Le critère applicable est **WCAG 2.1
   SC 1.4.11 « Contraste des éléments non textuels » : ≥ 3:1**, un tracé étant un objet graphique et non
   du texte.
2. **Les étiquettes du fond (jusqu'à `#d4d4dc`) ne doivent jamais entrer dans le calcul**, parce que les
   couches de tracés sont insérées **sous les couches `symbol` du style** (`beforeId` = première couche
   `symbol`). Les toponymes restent donc toujours au-dessus des tracés et lisibles. **C'est une contrainte
   normative de rendu, pas une préférence** (§6.1).

À quoi s'ajoute le halo obligatoire de §5.2, qui rend le contraste **local** d'un tracé indépendant de ce
qu'il survole : chaque trait est bordé d'un liseré `#0A0A0A`, donc la colonne « vs `#0A0A0A` » du tableau
de §2 est la valeur qui s'applique en pratique sur toute la longueur du tracé. Les colonnes « vs `#333` »
et « vs `#484848` » sont la **garantie de repli** si le halo est masqué (zoom minimal, densité forte).

---

## 2. Livrable 1 — Les quatre tokens `--color-map-*`

### 2.1 La famille

Famille **dédiée**, hors palette sémantique (contrainte du fondateur, ADR-018 §Alternatives écartées).
Aucune des quatre teintes n'appartient aux familles réservées : vert `#4ADE80` (récupération/cardio),
bleu `#60A5FA` (charge/sommeil/données), orange `#F59E0B` (douleur/gêne/alerte), violet `#A78BFA`
(coach IA & actions), rouge `#F87171` (danger).

| Token | Sport | Hex | Famille | Motif de trait (2ᵉ canal) | Icône de pastille |
| ----- | ----- | --- | ------- | -------------------------- | ----------------- |
| `--color-map-route` | **Route** | **`#22D3EE`** | cyan | **plein** | `Route` |
| `--color-map-trail` | **Trail** | **`#F472B6`** | rose magenta | **tirets courts** | `Mountain` |
| `--color-map-hike` | **Rando** | **`#E4E4E7`** | neutre clair (zinc-200) | **pointillé rond** | `Backpack` |
| `--color-map-bike` | **Vélo** | **`#FDE047`** | jaune | **tirets longs** | `Bike` |

Deux tokens de service complètent la famille :

| Token | Hex | Rôle |
| ----- | --- | ---- |
| `--color-map-casing` | `#0A0A0A` | halo/liseré sous tout tracé — c'est `--color-background`, réexposé sous un nom qui dit son rôle cartographique |
| `--color-map-selected-casing` | `#FFFFFF` | halo du tracé sélectionné (un seul à la fois) |

**Pourquoi ces quatre-là, et pas quatre teintes vives « classiques »** : les familles vert, bleu, orange,
violet et rouge sont toutes réservées par la charte §1.4. L'espace disponible se réduit alors au cyan,
au magenta/rose, au jaune et au neutre. C'est précisément — et heureusement — le quadruplet le plus
robuste au daltonisme (§2.3) : les deux pôles préservés par la dichromatie (bleu et jaune), un achromatique,
et une quatrième teinte séparée par la clarté.

**Attribution des teintes aux sports** — elle n'est pas arbitraire, elle maximise l'écart sur les deux
paires qui se côtoient le plus souvent à l'écran :

- **Route ∩ Vélo** est fréquent (ADR-018 §5.4) ⟹ `#22D3EE` (cyan) vs `#FDE047` (jaune) = les **deux pôles
  opposés** de l'axe bleu–jaune, l'écart le plus grand possible, et le seul qui survive intégralement à la
  deutéranopie comme à la protanopie.
- **Trail ⊂ Rando** est systématique ⟹ `#F472B6` (rose, L 0,35) vs `#E4E4E7` (neutre, L 0,78) = **2,09:1**
  de contraste de clarté entre les deux, le plus grand écart de la palette.
- La paire la plus faible en clarté (`#22D3EE` / `#F472B6`, 1,47:1) tombe sur **Route et Trail**, qui sont
  **disjoints par construction** (`revêtu` ⊻ `non revêtu`, ADR-018 §5.2) : un même tracé ne peut jamais
  porter les deux, et leur voisinage à l'écran est moins fréquent.

**Notes de choix, assumées :**

- `#E4E4E7` est **volontairement achromatique** : Rando est la catégorie fourre-tout (tout non-revêtu
  praticable à pied), sa teinte est donc la teinte « par défaut ». C'est aussi le zinc-200 de la rampe de
  gris déjà utilisée par la charte (`#A1A1AA` = zinc-400), donc cohérent avec l'existant.
  Risque identifié : un trait clair sur fond gris peut se lire comme une voirie du fond de carte.
  **Neutralisé par le motif pointillé** (convention cartographique du sentier) et par le halo noir : le
  fond ne dessine aucune ligne pointillée claire.
- `#F472B6` (teinte 330°) est à 30° de `--color-danger` `#F87171` (teinte 0°) et de clarté voisine.
  **Collision bornée et acceptée** : les tokens `--color-map-*` n'existent que dans le canevas de la carte,
  et aucun élément `--color-danger` n'est autorisé **à l'intérieur** du canevas (§7.5 : l'état d'erreur est
  une carte opaque posée au-dessus, jamais un trait). Les deux ne se rencontrent donc jamais.
- `#FDE047` (teinte 54°) est à 16° de `--color-warning` `#F59E0B` (teinte 38°), mais **beaucoup plus clair**
  (L 0,747 contre 0,439, soit 1,70:1 de contraste entre les deux). Même argument de cloisonnement : le seul
  usage d'orange sur cet écran est le label `DONNÉES PARTIELLES` du bandeau dégradé (§7.4), posé sur une
  surface opaque hors canevas.

### 2.2 Contrastes calculés

Luminances relatives (WCAG 2.1) — données pour que les ratios soient re-vérifiables :

| Couleur | L |
| ------- | - |
| `#22D3EE` | 0,5311 |
| `#F472B6` | 0,3465 |
| `#E4E4E7` | 0,7775 |
| `#FDE047` | 0,7466 |
| `#0A0A0A` (fond app + halo) | 0,00304 |
| `#1A1A1A` (surface) | 0,01034 |
| `#333333` (fond de carte) | 0,0331 |
| `#484848` (pire cas fond de carte) | 0,0648 |

**Ratios (arrondis au centième) :**

| Token | vs `#0A0A0A` app + **halo** | vs `#1A1A1A` surface | vs `#333333` fond carte | vs `#484848` **pire cas carte** | Verdict SC 1.4.11 (≥ 3:1) |
| ----- | --- | --- | --- | --- | --- |
| `--color-map-route` `#22D3EE` | **10,96:1** | 9,63:1 | 6,99:1 | **5,06:1** | ✅ largement |
| `--color-map-trail` `#F472B6` | **7,48:1** | 6,57:1 | 4,77:1 | **3,45:1** | ✅ |
| `--color-map-hike` `#E4E4E7` | **15,60:1** | 13,71:1 | 9,96:1 | **7,21:1** | ✅ largement |
| `--color-map-bike` `#FDE047` | **15,02:1** | 13,20:1 | 9,59:1 | **6,94:1** | ✅ largement |

**Les quatre passent AA sur les deux fonds exigés**, y compris dans le pire cas cartographique.
`--color-map-trail` est la plus tendue (3,45:1) : c'est elle qui rend le halo de §5.2 non négociable.

**Texte `#0A0A0A` sur remplissage** (pastille de filtre active, badge plein de la bottom sheet) :

| Fond | Ratio | Verdict AA texte (≥ 4,5:1) |
| ---- | ----- | -------------------------- |
| `#0A0A0A` sur `#22D3EE` | 10,96:1 | ✅ AAA |
| `#0A0A0A` sur `#F472B6` | 7,48:1 | ✅ AAA |
| `#0A0A0A` sur `#E4E4E7` | 15,60:1 | ✅ AAA |
| `#0A0A0A` sur `#FDE047` | 15,02:1 | ✅ AAA |

Règle de la charte §5 confirmée sans exception : **le texte posé sur un remplissage clair est toujours
`#0A0A0A`, jamais blanc.**

**Texte de la famille sur `--color-surface` `#1A1A1A`** (badges en contour de la bottom sheet, libellés de
légende) : colonne 2 ci-dessus, de 6,57:1 à 13,71:1 — **toutes AAA**. Aucune correction nécessaire, à la
différence du violet-500 traité en charte §5.

### 2.3 Vérification deutéranopie / protanopie

La deutéranopie et la protanopie suppriment l'axe rouge–vert et laissent intacts **(a) l'axe bleu–jaune**
et **(b) la clarté**. La vérification porte donc sur ces deux dimensions, pour les six paires.

| Paire | Contraste de **clarté** | Axe bleu–jaune | Verdict dichromatie | Co-occurrence à l'écran |
| ----- | --- | --- | --- | --- |
| Route `#22D3EE` / Vélo `#FDE047` | 1,37:1 | **pôles opposés** (bleu vs jaune) | ✅ **très forte** | fréquente (`Route ∩ Vélo`) |
| Trail `#F472B6` / Rando `#E4E4E7` | **2,09:1** | rose → bleu-gris désaturé vs achromatique | ✅ **forte** (clarté) | systématique (`Trail ⊂ Rando`) |
| Trail `#F472B6` / Vélo `#FDE047` | 2,01:1 | pôles opposés + clarté | ✅ très forte | possible |
| Route `#22D3EE` / Rando `#E4E4E7` | 1,42:1 | cyan saturé vs achromatique | ✅ correcte (chroma) | possible |
| Rando `#E4E4E7` / Vélo `#FDE047` | **1,04:1** | achromatique vs **jaune préservé** | ⚠️ **par la chroma seule** | rare (quasi disjoints) |
| Route `#22D3EE` / Trail `#F472B6` | **1,47:1** | tous deux du côté bleu après simulation | ⚠️ **paire la plus faible** | **impossible sur un même tracé** (disjoints) |

**Deux paires faibles, toutes deux instruites plutôt qu'ignorées :**

- **Rando / Vélo (1,04:1 de clarté)** — indiscernables par la clarté, mais séparées par la **chroma sur
  l'axe le mieux préservé qui soit** : le jaune est la teinte que la dichromatie conserve intégralement,
  face à un achromatique. C'est, en pratique, l'un des couples les plus sûrs. Reste le cas de
  l'**achromatopsie** (monochromatie, ~1/33 000), pour lequel la clarté ne suffit plus : c'est
  le motif de trait qui tranche (pointillé rond vs tirets longs — les deux motifs les plus éloignés de
  la palette). Les deux sports sont par ailleurs quasi disjoints (Vélo exige `cycleway` ou revêtu, Rando
  exige non revêtu).
- **Route / Trail (1,47:1)** — la seule paire réellement tendue en dichromatie, le cyan et le rose
  convergeant tous deux vers un bleu désaturé. **Trois raisons de l'accepter** : (i) `Route ∩ Trail = ∅`
  par construction, un même tracé ne peut jamais hésiter entre les deux ; (ii) 1,47:1 de clarté reste
  perceptible sur un trait de 2 à 5 px bordé de noir ; (iii) les motifs sont les plus opposés qui soient,
  **trait plein vs tirets courts**.

**Effet spécifique de la protanopie** : elle assombrit fortement la composante rouge. `#F472B6`, qui en
contient beaucoup, y perd de la clarté perçue. Conséquence double : cela **améliore** sa séparation d'avec
`#22D3EE`, mais cela **rapproche du plancher** son contraste vis-à-vis des zones les plus claires du fond
(`#484848`, déjà à 3,45:1 en vision typique). **C'est la deuxième justification structurelle du halo
`#0A0A0A`** : il rend le contraste local indépendant du fond, donc indépendant de la simulation.

**Protocole de vérification empirique à exécuter en L3** (cette analyse est structurelle, elle ne remplace
pas un test sur rendu réel) : ouvrir `/carte` avec les quatre filtres actifs, puis Chrome DevTools →
*Rendering* → *Emulate vision deficiencies* → `deuteranopia`, `protanopia`, `achromatopsia`. Critère de
réussite : **les quatre motifs de trait restent identifiables dans les trois simulations**, indépendamment
de la teinte. Si une teinte devient ambiguë, c'est acceptable ; si un **motif** devient ambigu, c'est un
défaut à corriger (élargir l'écart de motif, jamais la teinte).

### 2.4 Second canal d'information (WCAG 1.4.1)

La couleur n'est **jamais** le seul porteur d'information. Quatre canaux redondants, dans l'ordre de
robustesse :

1. **Motif de trait** — canal principal, présent sur le tracé lui-même, sans interaction :

   | Sport | `line-dasharray` (multiples de `line-width`) | `line-cap` | Lecture |
   | ----- | ------------------------------------------- | ---------- | ------- |
   | Route | *(aucun — trait continu)* | `round` | continuité du revêtement |
   | Vélo | `[3, 1.5]` | `butt` | tirets longs |
   | Trail | `[1.5, 1]` | `butt` | tirets courts |
   | Rando | `[0, 2]` | `round` | pointillé rond (convention du sentier) |

   Les quatre motifs sont ordonnés du plus dense au moins dense : plein → tirets longs → tirets courts →
   points. L'ordre est mémorisable et reste lisible à 2 px.

2. **Pastille de filtre = légende** — la pastille active affiche **un échantillon du trait réel**
   (segment de 16 px portant le motif du sport) à gauche de son libellé. La légende n'est donc pas un
   élément séparé à chercher : elle est dans le contrôle qui produit l'affichage (§4).
3. **Libellé textuel** — « Route », « Trail », « Rando », « Vélo » sont écrits en toutes lettres sur les
   pastilles, jamais réduits à une puce colorée.
4. **Bottom sheet** — au tap sur un tracé, **tous** ses sports sont listés sous forme de badges textuels
   (§6.3). C'est le canal qui rattrape l'information écrasée par la règle de priorité du livrable 2.

---

## 3. Livrable 2 — Rendu d'un chemin appartenant à plusieurs filtres actifs

### 3.1 La décision

> **Priorité fixe entre sports, évaluée sur les seuls filtres actifs.**
> Ordre : **Vélo > Trail > Route > Rando**.
> Le tracé est dessiné **une seule fois**, dans la teinte et le motif du premier sport de cet ordre qui
> est **à la fois** porté par le tracé **et** actif dans les pastilles.

```
PRIORITÉ = ['bike', 'trail', 'route', 'hike']   // du plus prioritaire au moins prioritaire

renderSport(feature, filtresActifs) =
  PRIORITÉ.find(s => filtresActifs.has(s) && feature.properties.sports.includes(s)) ?? null

// null ⟹ le tracé n'est pas rendu du tout (aucun de ses sports n'est actif)
```

`renderSport` est une **propriété calculée côté client**, recalculée à chaque changement de pastille, puis
poussée par `source.setData()`. **Aucune requête réseau** — conforme au critère de recette L3 d'ADR-018.

### 3.2 Le point qui fait toute la différence : « sur les filtres actifs », pas « sur `sports` »

C'est la moitié utile de la règle. Un chemin `sports: ['trail', 'hike']` :

| Filtres actifs | Teinte rendue | Ce que l'utilisateur apprend |
| -------------- | ------------- | --------------------------- |
| Trail + Rando | rose, tirets courts | c'est un sentier étroit |
| Rando seul | **neutre, pointillé** | il est bien retenu par « Rando » |
| Trail seul | rose, tirets courts | il est bien retenu par « Trail » |
| Vélo seul | *(non rendu)* | il n'est pas cyclable |

**Décocher une pastille change la couleur des tracés qui restent.** C'est la preuve visuelle que le filtre
agit, et cela supprime le pire défaut d'une priorité naïve calculée sur `sports` brut : une teinte qui ne
correspond à aucun filtre coché.

### 3.3 Justification de l'ordre

L'ordre découle de deux règles indépendantes, chacune défendable seule.

**R1 — le sous-ensemble bat le sur-ensemble.** `Trail ⊂ Rando` par construction (ADR-018 §5.4). Si Rando
gagnait, **la teinte Trail ne s'afficherait jamais** dès que Rando est actif, et la pastille Trail
deviendrait décorative. ⟹ `Trail > Rando`.

**R2 — la contrainte d'accès la moins devinable l'emporte.** « Vélo » est le seul filtre porteur d'une
information d'accès **non piétonne**. Un coureur qui voit une piste cyclable comprend immédiatement qu'il
peut y courir ; un cycliste qui verrait la même voie colorée « Route » ne saurait pas s'il a le droit d'y
rouler. L'information qui se perd n'est pas symétrique. ⟹ `Vélo > Route`, et `Vélo > Trail/Rando`.

**Comparaisons qui ne se produisent jamais** : `Route ∩ Trail = ∅` et `Route ∩ Rando = ∅` (revêtu ⊻ non
revêtu, ADR-018 §5.2). La position de « Route » dans l'ordre n'a donc d'effet que face à « Vélo », déjà
tranché par R2. L'ordre est **total** — donc le rendu est déterministe et testable — sans être arbitraire.

**Effet de bord assumé, à valider sur données réelles** : la plupart des voies revêtues dédiées (voies
vertes, berges aménagées) admettent le vélo. Avec les quatre filtres actifs, elles rendront donc en
**jaune (Vélo)**, et la teinte **cyan (Route) deviendra rare**. Ce n'est pas un défaut mais une lecture :
*cyan = revêtu **sans** vélo*, c'est-à-dire précisément les voies où un coureur ne croisera pas de
cyclistes — une information utile. Voir §10, point d'arbitrage n°1.

### 3.4 Ce qui a été écarté, et pourquoi

| Option | Rejet |
| ------ | ----- |
| **Tracé double (deux lignes parallèles)** | Viole frontalement la contrainte technique du lot L3 (« le chemin doit être dessiné une seule fois »). Impose un `line-offset` par sport, donc **deux halos**, donc un aliasing visible sur les courbes et un décrochage aux intersections. À 2 px de large au zoom 12, deux traits décalés de 3 px sont illisibles et se lisent comme deux chemins distincts — un contresens cartographique. |
| **Trait bicolore alterné** (tirets de A par-dessus le plein de B) | Techniquement, exige **deux couches superposées** sur la même géométrie : double halo, double coût de rendu, et surtout la couche du dessus masque partiellement celle du dessous, ce qui produit un liseré parasite. La variante « une seule couche avec `line-pattern` » supposerait de générer une sprite par **combinaison** de sports (6 paires + 4 triplets réalistes), chacune illisible sous 4 px. |
| **Style « multi » neutre** | Détruit l'information au lieu de l'arbitrer : l'utilisateur perd le sport, alors qu'il en avait au moins un pertinent. Et le neutre clair est déjà pris par `--color-map-hike`. |
| **Priorité par filtre le plus récemment activé** | Rendu non déterministe : deux utilisateurs ayant les mêmes filtres verraient des couleurs différentes selon l'ordre de leurs clics. Non testable, non explicable. |
| **Priorité calculée sur `sports` brut** (sans tenir compte des filtres actifs) | Produit des teintes qui ne correspondent à **aucune pastille cochée** — le défaut corrigé en §3.2. |
| **N'attribuer qu'un seul sport par chemin en amont** | Contraire à la décision du fondateur et déjà écarté par ADR-018. |

### 3.5 Compensation obligatoire de la perte d'information

La priorité **écrase** de l'information : un tracé Trail+Rando n'affiche qu'une teinte. Deux compensations,
toutes deux normatives :

1. **La bottom sheet liste tous les sports** du tracé (§6.3), le badge du sport **effectivement rendu**
   étant **plein** et les autres **en contour**. L'utilisateur découvre la règle de priorité par
   l'exemple, sans documentation.
2. **L'annonce `aria-live`** après chaque changement de filtre porte le décompte par sport rendu :
   « 42 tracés affichés : 18 Vélo, 15 Trail, 9 Rando. » — c'est l'équivalent non visuel de la légende.

---

## 4. Pastilles de filtre

Variante de la charte §4.4 (chips de réponse), avec **deux écarts assumés** : le remplissage prend la
teinte du sport au lieu de `--color-accent`, et la sélection est **multiple et indépendante**
(`aria-pressed`) au lieu d'exclusive (`radiogroup`).

### 4.1 Géométrie

| Propriété | Valeur |
| --------- | ------ |
| Hauteur | **44 px** (cible tactile de la charte §5) |
| Rayon | `--radius-full` |
| Padding horizontal | `space-3` (12 px) |
| Gap interne (échantillon/icône ↔ libellé) | `space-2` (8 px) |
| Gap entre pastilles | `space-2` (8 px) |
| Typo du libellé | `--text-small` (13/18) en **sans 600** |
| Échantillon de trait / icône | 16 × 16 px |
| Rangée | `overflow-x: auto`, `scroll-snap-type: x proximity`, `scroll-padding-inline: 20px`, gouttière `space-5` (20 px) |

À 375 pt, les quatre pastilles totalisent ≈ 350 px pour 335 px disponibles : **la rangée défile
horizontalement d'une quinzaine de pixels**. C'est assumé et préférable à une troncature de libellé — mais
la dernière pastille doit être visible en « peek », jamais coupée au ras de la gouttière. À partir de
390 pt, la rangée tient sans défilement.

### 4.2 États

| État | Fond | Bordure | Contenu à gauche | Libellé |
| ---- | ---- | ------- | ---------------- | ------- |
| **actif** | `--color-map-<sport>` | aucune | **échantillon de trait** 16 × 2 px en `#0A0A0A`, portant le motif du sport | `#0A0A0A` |
| **inactif** | transparent | 1 px `--color-border-strong` `#3A3A3A` | icône outline 16 px `--color-foreground-muted` | `--color-foreground-muted` `#A1A1AA` (7,8:1 ✅) |
| **survol (inactif)** | `--color-surface-raised` `#262626` | 1 px `#3A3A3A` | icône `#FFFFFF` | `#FFFFFF` |
| **survol (actif)** | teinte du sport à 88 % d'opacité sur `#141414` | aucune | idem actif | `#0A0A0A` |
| **pressé** | teinte du sport, `transform: scale(0.97)` | — | — | — |
| **focus-visible** | inchangé | **double anneau** : `outline: 2px solid #FFFFFF; outline-offset: 2px` + `box-shadow: 0 0 0 4px #0A0A0A` | — | — |
| **désactivé** | *n'existe pas sur cet écran* | — | — | — |

**Pourquoi un anneau de focus blanc et non violet** : le violet `--color-accent` de la charte §5 suppose
un fond `#0A0A0A` contrôlé. Ici les pastilles sont sur `--color-surface-sunken` `#141414`, mais les autres
contrôles (§5.3, §5.4) flottent sur un fond de carte dont la luminance n'est **pas** contrôlée. Un anneau
unique ne peut donc pas garantir le contraste. Le **double anneau blanc + noir** est contrasté sur
n'importe quel fond (`#FFFFFF` vs `#0A0A0A` = 19,6:1) et sert de règle unique à tous les contrôles de
l'écran Carte. Sur les pastilles actives, l'anneau blanc ne peut pas se confondre avec le remplissage
puisqu'il en est séparé par l'offset noir.

### 4.3 Comportement et accessibilité

- Conteneur : `<div role="group" aria-label="Filtres par sport">`.
- Chaque pastille : `<button type="button" aria-pressed="true|false">`. **Pas** `role="radio"` (les filtres
  sont indépendants), **pas** `role="checkbox"` (le contrôle produit un effet immédiat, `aria-pressed` est
  le motif juste).
- État initial : **les quatre actifs**.
- Persistance : `localStorage`, clé `hybride.map.filters`. Aucun stockage serveur (ADR-018 §7 : rien n'est
  écrit).
- **Zéro filtre actif est autorisé** — ne jamais désactiver la dernière pastille (un contrôle désactivé
  sans explication est plus déroutant qu'un état vide expliqué). L'écran bascule sur l'état
  « aucun sport sélectionné » de §7.3c, qui porte l'action de sortie.
- Chaque changement met à jour la zone `aria-live="polite"` de §8.
- Navigation clavier : `Tab` entre les pastilles (ce sont des boutons indépendants, pas un groupe à
  flèches), `Espace`/`Entrée` pour basculer.

---

## 5. Chrome de l'écran

`/carte` est un **sous-écran** (patron `Yf6zY`) : **pas de tab bar**, fermeture explicite vers `/planning`.

### 5.1 En-tête

| Propriété | Valeur |
| --------- | ------ |
| Hauteur | 56 px + `env(safe-area-inset-top)` |
| Fond | `--color-surface-sunken` `#141414`, **opaque** |
| Gauche | bouton `ArrowLeft` 24 px dans une cible 44 × 44, `--color-foreground` `#FFFFFF`, `aria-label="Fermer la carte et revenir au planning"` |
| Titre | « **Carte** », `--text-heading` (sans 600, 20/26), `#FFFFFF` |
| Droite | *(vide)* |

**En-tête opaque, jamais translucide sur la carte** : un en-tête en verre dépoli au-dessus d'un fond de
carte à luminance variable rend le contraste du titre non calculable. Sur `#141414`, le blanc est à
17,9:1.

**Navigation retour** : `router.push('/planning')`, **pas** `router.back()`. ADR-018 L1 exige une fermeture
qui *ramène à `/planning`* quel que soit l'historique (`/carte` peut être atteint par un lien partagé ou un
rechargement). Le bouton retour natif du navigateur, lui, se comporte normalement.

### 5.2 Zone de carte et rendu des tracés

Sous l'en-tête et la rangée de filtres (chrome total : 56 + 68 = **124 px** + safe area), la carte occupe
toute la hauteur restante, jusqu'au bas de l'écran.

**Épaisseurs de trait** (`line-width`, en px CSS) :

```
["interpolate", ["linear"], ["zoom"], 12, 2, 14, 2.5, 16, 3.5, 18, 5]
```

| Zoom | Trait | Halo (`line-width` du casing) |
| ---- | ----- | ----------------------------- |
| 12 (zoom minimal) | 2,0 px | 5,0 px |
| 14 | 2,5 px | 5,5 px |
| 16 | 3,5 px | 6,5 px |
| 18 et + | 5,0 px | 8,0 px |

**Halo** — `--color-map-casing` `#0A0A0A`, `line-opacity: 0.9`, `line-blur: 0`, `line-cap`/`line-join:
round`, largeur = trait + 3 px (1,5 px de part et d'autre).

Trois précisions normatives :

1. **Le halo est toujours plein**, y compris sous un trait en tirets ou en pointillés. Les creux du motif
   laissent alors voir le noir, ce qui **renforce** la lisibilité du motif sur les zones claires du fond
   au lieu de la dégrader.
2. **Les tracés sont opaques** (`line-opacity: 1`). Toute transparence détruirait les ratios calculés en
   §2.2, qui supposent une couleur pleine. Deux exceptions, toutes deux **transitoires** et signalées
   comme telles : rafraîchissement en cours (0,5 — §7.1) et atténuation des tracés non sélectionnés
   (0,45 — §5.5). Dans ces deux états, le contraste n'est pas garanti ; ils ne doivent jamais être
   l'état de repos.
3. **Insertion sous les étiquettes** : toutes les couches de tracés sont ajoutées avec `beforeId` = **id
   de la première couche de type `symbol`** du style. Les toponymes du fond restent au-dessus. C'est ce
   qui autorise à exclure `#d4d4dc` du pire cas de contraste (§1).

### 5.3 Bouton flottant de recentrage

| Propriété | Valeur |
| --------- | ------ |
| Taille | 48 × 48 px, `--radius-full` |
| Position | bas-droite, 16 px du bord droit, **12 px au-dessus du bandeau d'attribution** + safe area |
| Fond | `--color-surface` `#1A1A1A` |
| Bordure | 1 px `--color-border-strong` `#3A3A3A` |
| Ombre | `--shadow-map-control: 0 2px 8px rgba(0, 0, 0, 0.6)` |
| Icône | `LocateFixed` 20 px, `--color-foreground` `#FFFFFF` |
| `aria-label` | « Recentrer sur ma position » |

**Exception d'ombre, documentée.** La charte §3.3 proscrit les ombres portées : la profondeur y passe par
un écart de luminosité entre surfaces. **Ce mécanisme ne fonctionne pas sur une carte**, où la luminance
du fond n'est pas contrôlée (`#1A1A1A` sur `#333333` ne donne que 1,27:1 — la surface du bouton
disparaîtrait). L'ombre `--shadow-map-control` est donc la seule façon de détacher un contrôle flottant.
Portée strictement limitée aux contrôles flottants de `/carte`.

**États :**

| État | Rendu |
| ---- | ----- |
| défaut | ci-dessus |
| survol | fond `--color-surface-raised` `#262626` |
| pressé | fond `#0A0A0A` |
| focus-visible | double anneau de §4.2 |
| **chargement** (géolocalisation en cours) | spinner 20 px `--color-accent`, `aria-busy="true"`, bouton non cliquable mais **non désactivé** |
| **actif** (vue centrée sur l'utilisateur) | icône `--color-accent` `#A78BFA` (7,3:1 sur `#1A1A1A`… vérifié charte §5 : 6,4:1 ✅) |
| **refusé** (permission refusée) | icône `LocateOff` `--color-foreground-subtle` `#8B8B94`, `aria-disabled="true"` ; **le tap reste actif** et déclenche le bandeau explicatif de §7.8 — jamais un bouton mort |

**Marqueur de position** : disque 12 px `--color-accent` `#A78BFA`, anneau 2 px `#0A0A0A`, halo de
précision `rgba(167, 139, 250, 0.15)`. Le violet est ici légitime : c'est « moi/mon action », pas un sport.

### 5.4 Bouton « Liste des tracés » — alternative clavier et motrice

ADR-018 L3 exige une « alternative clavier au tap sur un tracé ». Un tracé est une ligne de 2 à 5 px : ce
n'est ni atteignable au clavier, ni raisonnablement pointable avec une motricité fine réduite. La liste
n'est donc **pas un contournement d'accessibilité, c'est le mode d'accès principal pour une partie des
utilisateurs**.

- **Déclencheur** : second bouton flottant, même gabarit que §5.3, empilé **12 px au-dessus** de lui,
  icône `List` 20 px, `aria-label="Liste des tracés visibles"`, `aria-expanded`.
- **Panneau** : même conteneur que la bottom sheet (§6.1), hauteur max 60 % de la hauteur d'écran.
  - Titre : « Tracés visibles (N) », `--text-heading`.
  - Rows de 56 px : à gauche un **échantillon de trait** 20 × 3 px (teinte + motif du `renderSport`),
    puis le nom (ou « Chemin sans nom » en `--color-foreground-muted`), puis en `--text-small`
    `--color-foreground-muted` la méta « 4,2 km · Trail ». Séparateur 1 px `--color-border` `#262626`.
  - Chaque row est un `<button>` ; activation ⟹ ferme le panneau, cadre la carte sur le tracé
    (`fitBounds`, padding 48 px ; `jumpTo` si `prefers-reduced-motion`) et ouvre la bottom sheet.
  - Tri par distance croissante au centre de la vue. Plafond 50 items, puis
    « … et N autres. Zoome pour affiner. » en `--text-small` `--color-foreground-subtle`.
- **Focus** : piégé dans le panneau, `Échap` ferme, focus rendu au bouton déclencheur.

**Cible de la carte elle-même** : le tap sur un tracé utilise `queryRenderedFeatures` sur une boîte de
**24 × 24 px** centrée sur le point touché (±12 px), ce qui satisfait **WCAG 2.2 SC 2.5.8 (Target Size
Minimum, AA, 24 px)** sans ajouter de couche de rendu invisible. La liste de §5.4 fournit l'alternative
≥ 44 px.

**Carte au clavier** : le canevas est `tabindex="0"`, `role="application"`, `aria-label="Carte des tracés
outdoor. Flèches pour se déplacer, plus et moins pour zoomer, bouton Liste des tracés pour parcourir les
résultats."`, avec le double anneau de focus de §4.2. `keyboard: true` dans les options MapLibre.

### 5.5 Tracé sélectionné

- `line-width` × 1,6, halo en `--color-map-selected-casing` `#FFFFFF` à 0,9 d'opacité, 2 px de part et
  d'autre. Un seul tracé sélectionné à la fois.
- Les autres tracés passent à `line-opacity: 0.45` (état transitoire, cf. §5.2 point 2).
- **Le tracé sélectionné doit être retiré des couches de base** (`["!=", ["get","osmId"], selectedId]`
  ajouté à leurs filtres) : sans cela, il serait dessiné deux fois, ce qui produirait exactement le double
  halo que la contrainte L3 proscrit.

### 5.6 Attribution ODbL

Bandeau pleine largeur en bas du canevas, **jamais repliable** (ADR-018 §9, `compact: false`).

| Propriété | Valeur |
| --------- | ------ |
| Fond | `rgba(10, 10, 10, 0.80)` |
| Padding | 4 px vertical / 8 px horizontal + `env(safe-area-inset-bottom)` |
| Typo | `--text-caption` (12/16) |
| Couleur | `--color-foreground-subtle` `#8B8B94` |

Contraste vérifié **sur le composite le plus clair** : le voile à 80 % sur `#484848` donne `#181818`
(L 0,00913) ⟹ **5,26:1** ✅ AA. Sur le fond nominal `#333333`, composite `#131313` ⟹ 5,50:1.

Les liens de l'attribution (« OpenStreetMap », « Stadia Maps ») sont en `--color-foreground-muted`
`#A1A1AA` soulignés — ratio sur le même composite : ≈ 7,0:1 ✅. **Aucun contrôle flottant ne doit
recouvrir ce bandeau** : c'est une obligation de licence, pas une décoration (d'où les 12 px de garde en
§5.3).

---

## 6. Bottom sheet

### 6.1 Conteneur

| Propriété | Valeur |
| --------- | ------ |
| Fond | `--color-surface` `#1A1A1A` |
| Rayon | `--radius-xl` (20 px) **en haut uniquement** |
| Padding | `space-5` (20 px), + `env(safe-area-inset-bottom)` |
| Ombre | `--shadow-overlay: 0 -8px 24px rgba(0, 0, 0, 0.6)` (charte §3.3, seule ombre déjà admise) |
| Hauteur | selon contenu, max **45 %** de la hauteur d'écran, scroll interne au-delà |
| Poignée | 36 × 4 px, `--radius-full`, `--color-border-strong` `#3A3A3A`, centrée, 8 px de marge haute |
| Fermeture | glissement vers le bas, bouton `X` 24 px dans une cible 44 × 44 en haut à droite, touche `Échap` |

Pas de points d'ancrage multiples en phase 1. `role="dialog"`, `aria-modal="false"` (la carte reste
manipulable derrière), `aria-labelledby` pointant sur le titre ; à l'ouverture le focus va sur le titre
(`tabindex="-1"`), à la fermeture il revient sur l'élément déclencheur (le canevas ou la row de liste).
`prefers-reduced-motion` : apparition en fondu 120 ms, sans translation.

### 6.2 Structure — **trois champs, aucun emplacement réservé**

```
┌─────────────────────────────────────────┐
│              ▁▁▁▁ (poignée)          ✕  │
│                                          │
│  Sentier des Crêtes            ← NOM     │  --text-heading, #FFFFFF
│  [TRAIL] [Rando]               ← badges  │  cf. §6.3
│                                          │
│  ─────────────────────────────────────   │  1px #262626
│  Distance                        4,2 km  │  ← CHAMP 2
│  ─────────────────────────────────────   │
│  Surface                  Terre battue   │  ← CHAMP 3
│  ─────────────────────────────────────   │
│                                          │
│  Voir sur OpenStreetMap →                │
└─────────────────────────────────────────┘
```

**La mise en page est une pile de rows, pas une grille.** C'est le point que le fondateur a explicitement
demandé de traiter (question ouverte n°6). Une grille de métriques 2 colonnes — le motif habituel de la
charte — laisserait un **trou visible** avec trois champs, et ce trou se lirait comme le champ dénivelé
manquant, c'est-à-dire comme le bug que le fondateur veut éviter. Une pile de rows :

- n'a **aucun emplacement vide** avec trois champs ;
- accueille le dénivelé en L4 par **l'ajout d'une row**, sans aucune retouche de mise en page ;
- se dégrade proprement si un champ est absent (la row disparaît, §6.4).

**Géométrie d'une row** : hauteur 44 px, label à gauche `--text-small` (13/24) `--color-foreground-muted`,
valeur à droite `--text-body-strong` (15/24 sans 600) `#FFFFFF`, séparateur 1 px `--color-border`
`#262626` entre rows (pas au-dessus de la première, pas sous la dernière). Balisage `<dl>` / `<dt>` / `<dd>`.

### 6.3 Badges de sports — c'est ici que la règle de priorité se lit

Rangée de badges sous le titre, gap `space-2` (8 px), reprenant la charte §4.5 (contour 1 px, `--text-label`
11 px majuscule tracké, `--radius-full`, padding 4/10).

| Badge | Rendu |
| ----- | ----- |
| Sport **effectivement rendu** (`renderSport`) | **plein** : fond `--color-map-<sport>`, texte `#0A0A0A` (7,5:1 à 15,6:1 ✅ §2.2) |
| Autres sports du tracé | **contour** : 1 px et texte en `--color-map-<sport>` sur `#1A1A1A` (6,6:1 à 13,7:1 ✅ AAA) |
| Sport porté par le tracé mais **filtre décoché** | contour, en `--color-foreground-subtle` `#8B8B94` (5,2:1 ✅), avec `title`/`aria-label` « filtre désactivé » |

Ordre d'affichage : le badge plein d'abord, puis les autres dans l'ordre de priorité. C'est ce
micro-détail qui rend la règle de §3 **auto-explicative** : l'utilisateur voit d'un coup d'œil que son
tracé rose est aussi une Rando.

### 6.4 Contenu et formats

| Champ | Source | Format | Absence |
| ----- | ------ | ------ | ------- |
| **Nom** (titre) | `properties.name` | tel quel | « Chemin sans nom » en `--color-foreground-muted` |
| **Distance** | `properties.distanceKm` | `< 1 km` → « 850 m » ; sinon « 4,2 km » (1 décimale, **virgule** fr-FR) | **row absente** — jamais « — » |
| **Surface** | `properties.surface` | table ci-dessous | « Non renseignée » en `--color-foreground-muted` si `surface === null` **ou** `surfaceInferred === true` |

**Pourquoi « Non renseignée » pour la surface mais une row absente pour la distance** : la surface est
l'un des trois champs annoncés et son absence est une **information** (OSM ne la porte pas, ADR-018 §5.2 :
« on ne fabrique pas une donnée qu'OSM ne porte pas »). La distance, elle, est calculée sur la géométrie et
n'est nulle que dans des cas dégénérés : afficher un tiret y serait du bruit.

**Cas limite** : si distance **et** surface sont absentes, ne pas afficher une sheet à une seule ligne de
titre — remplacer le bloc de rows par « Aucune donnée détaillée sur ce chemin. » en `--text-body`
`--color-foreground-muted`, le lien OSM restant présent.

**Table de libellés de surface** (fr) — élément de contenu, non de style :

| OSM | Libellé | OSM | Libellé |
| --- | ------- | --- | ------- |
| `asphalt` | Asphalte | `ground` | Terrain naturel |
| `concrete`, `concrete:plates`, `concrete:lanes` | Béton | `dirt`, `earth` | Terre |
| `paved` | Revêtu | `grass` | Herbe |
| `paving_stones` | Pavés | `gravel` | Gravier |
| `sett` | Pavés anciens | `fine_gravel` | Gravier fin |
| `chipseal` | Enduit gravillonné | `compacted` | Terre compactée |
| `wood` | Platelage bois | `sand` | Sable |
| `metal` | Métal | `rock` | Roche |
| `unpaved` | Non revêtu | `mud` | Boue |

Valeur inconnue : afficher la valeur brute avec la première lettre en capitale, **jamais** « Inconnu ».

### 6.5 Lien OpenStreetMap — ~~proposé~~ **retiré de la phase 1**

> **Tranché par le fondateur le 2026-09-06 : ce lien ne figure pas dans la bottom sheet.**
>
> Motif : l'obligation ODbL est **déjà remplie** par l'attribution globale « © les contributeurs
> d'OpenStreetMap », visible sans interaction et non repliable sur le canevas (lot L1, ADR-018 §8).
> Un lien par-objet est un confort de traçabilité, pas une exigence de la licence — la bottom sheet
> reste donc à son périmètre annoncé : **trois champs et les badges de sports**, rien d'autre.
>
> Les **badges de sports (§6.3) sont conservés** : eux ne sont pas un confort mais une exigence
> WCAG 1.4.1, puisqu'ils portent l'information de sport que la règle de priorité (§3) écrase
> visuellement sur le tracé.
>
> **Conséquence sur le cas limite de §6.4** : si distance *et* surface sont absentes, le bloc de rows
> est remplacé par « Aucune donnée détaillée sur ce chemin. » — sans mention d'un lien OSM, qui
> n'existe plus. La sheet conserve alors son titre et ses badges, ce qui suffit à ne pas la laisser
> vide.
>
> Réévaluable en phase 2, où l'import GPX et les contributions communautaires donneront au lien
> par-objet une utilité qu'il n'a pas en lecture seule.

---

## 7. États d'écran

Principe transverse, hérité de la charte §4.11 : **jamais de spinner plein écran, jamais de canevas
blanc, jamais un état qui bloque la manipulation de la carte.** Tous les états ci-dessous sont des
surfaces opaques posées *au-dessus* du canevas, qui reste manipulable.

Deux gabarits seulement :

- **Gabarit A — bandeau** : pleine largeur moins les gouttières (20 px), collé sous la rangée de filtres,
  fond `--color-surface` `#1A1A1A`, `--radius-md` (12), padding 12/16, `--shadow-map-control`.
  Pour ce qui est transitoire ou secondaire.
- **Gabarit B — carte centrée** : largeur max 280 px, centrée dans la zone de carte, fond
  `--color-surface` `#1A1A1A`, `--radius-lg` (16), padding 16, `--shadow-map-control`.
  Pour ce qui empêche l'affichage de résultats.

### 7.1 Chargement

Gabarit **A**. Pill compacte : spinner 14 px `--color-accent` + « Recherche des tracés… » en
`--text-small` `--color-foreground-muted`. `aria-live="polite"`.

Les tracés déjà affichés **restent visibles** à `line-opacity: 0.5` pendant le rafraîchissement, plutôt
que de disparaître : un panoramique ne doit jamais vider l'écran.
`prefers-reduced-motion` : le spinner **ralentit** (1,5 s au lieu de 0,8 s) mais n'est pas supprimé —
c'est une animation porteuse de sens.

**Premier chargement de l'écran** (avant tout résultat) : squelettes interdits ici (il n'y a rien à
esquisser sur une carte). Le fond de carte s'affiche seul avec la pill de chargement.

### 7.2 Zoom insuffisant (`status: 'zoom_required'`)

Gabarit **B**. Icône `ZoomIn` 24 px `--color-foreground-muted` ; « **Zoome pour voir les tracés** » en
`--text-body-strong` `#FFFFFF` ; « Les chemins s'affichent à partir d'un rayon d'environ 10 km. » en
`--text-small` `--color-foreground-muted`. `aria-live="polite"`.

Les pastilles **restent actives et cliquables** : le filtre est un état persistant, pas une conséquence
du zoom. Ne rien griser.

### 7.3 Aucun résultat — **trois cas distincts, à ne jamais confondre**

C'est le piège classique de cet écran, et la conséquence directe d'ADR-018 (« l'état *aucun résultat* sera
fréquent, et doit être soigné plutôt que traité comme un cas limite »).

| Cas | Condition | Gabarit B |
| --- | --------- | --------- |
| **(a) Zone non cartographiée** | `trails.length === 0` | « **Aucun tracé cartographié ici.** » + « OpenStreetMap ne référence pas de chemin dédié dans cette zone. Déplace la carte ou zoome ailleurs. » + lien « Contribuer sur OpenStreetMap → » |
| **(b) Tout masqué par les filtres** | `trails.length > 0` et 0 rendu, ≥ 1 filtre actif | « **18 tracés masqués par tes filtres.** » + bouton secondaire « Tout afficher » |
| **(c) Aucun filtre actif** | 0 filtre actif | « **Aucun sport sélectionné.** » + « Choisis au moins un sport pour voir les tracés. » + bouton secondaire « Tout afficher » |

Afficher (a) alors qu'on est en (b) est un défaut fonctionnel, pas une approximation de rédaction :
l'utilisateur en conclurait à tort qu'il n'y a rien autour de lui. Le décompte de (b) est **le nombre réel
de tracés reçus**, pas une formule vague.

### 7.4 Dégradé (`degraded: true`)

Gabarit **A**, **persistant** jusqu'au prochain chargement complet réussi. Les tracés obtenus **sont
affichés** — c'est le principe même de la dégradation.

- `--text-label` (11 px majuscule tracké) `--color-warning` `#F59E0B` : « **DONNÉES PARTIELLES** »
  (9,2:1 sur `#0A0A0A`, 8,1:1 sur `#1A1A1A` ✅ charte §5)
- `--text-small` `--color-foreground-muted` : « Une partie de la zone n'a pas pu être chargée. »
- Bouton texte « Réessayer » en `--color-accent-text` `#A78BFA`, cible 44 px
- `aria-live="polite"`

C'est **le seul usage d'orange sur cet écran**, et il est hors canevas, sur une surface opaque —
donc sans risque de confusion avec `--color-map-bike` (§2.1).

### 7.5 Erreur totale (`502 OVERPASS_UNAVAILABLE`)

Gabarit **B**, selon la charte §4.11. `--text-label` `--color-danger` `#F87171` « ERREUR » ; message
`--text-body` `#FFFFFF` « Les tracés sont indisponibles pour le moment. » ; bouton **secondaire**
(charte §4.2) « Réessayer ».

Le fond de carte reste affiché et manipulable : la carte n'est pas en panne, seuls les tracés le sont.
`aria-live="polite"` — **jamais `assertive`** (charte §5).

### 7.6 Troncature (`truncated: true`)

Gabarit **A**, discret, une seule ligne `--text-small` `--color-foreground-subtle` `#8B8B94` :
« Affichage limité aux tracés les plus proches. Zoome pour tout voir. »
Jamais silencieux (ADR-018 §4.4), jamais bloquant.

### 7.7 Plafond client de tuiles atteint (ADR-018, question 2)

Gabarit **A**, persistant : « **Exploration limitée.** Recharge la page pour continuer à te déplacer. »
Le fond de carte gèle ; **les tracés déjà chargés restent pleinement lisibles et cliquables** — c'est
exactement ce que la formulation de l'ADR exige.

### 7.8 Géolocalisation refusée

Déclenché par le tap sur le bouton de recentrage en état `denied` (§5.3). Gabarit **A** :
« Localisation refusée. Active-la dans les réglages de ton navigateur pour te recentrer sur ta position. »
La carte reste utilisable et centrée sur sa position par défaut. **Jamais d'écran vide.**

### 7.9 Hors ligne

`navigator.onLine === false` — pas de service worker en phase 1 (ADR-018, constat 4), donc la carte ne
peut rien charger. Gabarit **B** : « **Pas de connexion.** La carte a besoin d'internet pour s'afficher. »
Affiché *avant* l'échec réseau, pour éviter un canevas noir muet.

---

## 8. Accessibilité — récapitulatif normatif

| Exigence | Mise en œuvre sur `/carte` |
| -------- | -------------------------- |
| **SC 1.4.11** — contraste non textuel ≥ 3:1 | §2.2 : de 3,45:1 à 7,21:1 dans le pire cas de fond de carte |
| **SC 1.4.3** — contraste texte ≥ 4,5:1 | §2.2 (pastilles, badges), §5.6 (attribution : 5,26:1 composite) |
| **SC 1.4.1** — la couleur n'est jamais seule | §2.4 : motif de trait + échantillon dans la pastille + libellé écrit + badges de la bottom sheet |
| **SC 2.5.8** — cible ≥ 24 px | §5.4 : boîte de sélection 24 × 24 px sur le canevas |
| **Cibles tactiles ≥ 44 px** (charte §5) | pastilles 44, contrôles flottants 48, rows de liste 56, bouton de fermeture 44 |
| **Focus visible** | **double anneau** blanc 2 px + offset noir 4 px, unique pour tout l'écran (§4.2) — le violet de la charte ne peut pas garantir le contraste sur un fond de carte |
| **Alternative clavier au tap** | §5.4, panneau « Liste des tracés » |
| **Carte navigable au clavier** | canevas `tabindex="0"`, `role="application"`, `aria-label` d'instructions, `keyboard: true` |
| **Zones live** | une seule région `aria-live="polite"` (jamais `assertive`) : « 42 tracés affichés : 18 Vélo, 15 Trail, 9 Rando. » après chargement, changement de filtre ou fin de panoramique ; porte aussi les états de §7 |
| **Ordre du focus** | retour → titre → 4 pastilles → canevas → bouton Liste → bouton Recentrer → attribution ; ordre DOM = ordre visuel |
| **`prefers-reduced-motion`** | `flyTo` → `jumpTo` (recentrage et cadrage) ; sheet en fondu sans translation ; spinner ralenti, pas supprimé ; aucune transition de teinte au changement de filtre |
| **Piège de focus** | uniquement dans le panneau Liste ; la bottom sheet ne le piège pas (`aria-modal="false"`, la carte reste utilisable) — `Échap` ferme les deux |
| **Restitution du focus** | à la fermeture d'une sheet ou d'un panneau, le focus revient sur l'élément déclencheur |

---

## 9. Tokens — bloc à insérer par `developer` en L3

> À ajouter à `docs/design-system.md` (nouvelle §1.5 « Couleurs de carte ») et à
> `apps/web/app/globals.css`. **Ce document ne modifie ni l'un ni l'autre.**

```css
:root {
  /* Carte — famille dédiée, hors palette sémantique (ADR-018, question 3) */
  --map-route: #22d3ee;  /* Route  — cyan            */
  --map-trail: #f472b6;  /* Trail  — rose magenta    */
  --map-hike:  #e4e4e7;  /* Rando  — neutre clair    */
  --map-bike:  #fde047;  /* Vélo   — jaune           */

  --map-casing: #0a0a0a;
  --map-selected-casing: #ffffff;

  --shadow-map-control: 0 2px 8px rgba(0, 0, 0, 0.6);
}

@theme inline {
  --color-map-route: var(--map-route);
  --color-map-trail: var(--map-trail);
  --color-map-hike:  var(--map-hike);
  --color-map-bike:  var(--map-bike);
  --color-map-casing: var(--map-casing);
}
```

### 9.1 Contrainte d'implémentation : MapLibre ne lit pas les variables CSS

Les propriétés `paint` de MapLibre attendent des littéraux, pas des `var(--…)`. Pour éviter la duplication
silencieuse (le pire scénario : le token CSS change, la couche de carte non) :

> **Source unique en TypeScript.** Déclarer les quatre hex dans `apps/web/lib/map/map-tokens.ts`,
> les consommer **à la fois** dans les couches MapLibre **et** dans le style en ligne des pastilles et
> des badges. Les variables CSS ci-dessus servent alors uniquement à ce que la charte reste complète et
> lisible ; si `developer` préfère les garder actives, ajouter un test unitaire qui assert l'égalité
> entre le module TS et les valeurs CSS.

### 9.2 Contrainte d'implémentation : `line-dasharray` n'est pas *data-driven*

`line-dasharray` n'accepte pas d'expression sur les propriétés d'entité dans MapLibre GL JS (seulement des
expressions de zoom). Le motif de trait ne peut donc pas être choisi dans une couche unique.

**Empilement retenu — 7 couches, chaque entité dessinée exactement une fois par groupe**, toutes insérées
`beforeId` = première couche `symbol` :

| # | Couche | Filtre | Rôle |
| - | ------ | ------ | ---- |
| 1 | `trails-casing` | `["all", ["has","renderSport"], ["!=",["get","osmId"], selectedId]]` | halo unique, **toujours plein** |
| 2 | `trails-line-hike` | `["==",["get","renderSport"],"hike"]` + exclusion du sélectionné | pointillé |
| 3 | `trails-line-route` | `… "route"` | plein |
| 4 | `trails-line-trail` | `… "trail"` | tirets courts |
| 5 | `trails-line-bike` | `… "bike"` | tirets longs |
| 6 | `trails-selected-casing` | `["==",["get","osmId"], selectedId]` | halo blanc |
| 7 | `trails-selected-line` | idem | trait épaissi |

**L'invariant « dessiné une seule fois » est garanti par construction** : `renderSport` est une valeur
**scalaire** par entité, donc les filtres des couches 2 à 5 **partitionnent** l'ensemble ; et le tracé
sélectionné est explicitement exclu des couches 1 à 5. Aucune superposition, aucun double halo, aucun
aliasing. C'est vérifiable par un test unitaire sur les filtres (leur intersection deux à deux est vide),
pas seulement à l'œil.

---

## 10. Point d'entrée depuis `/planning`

ADR-018 tranche le principe (lien depuis `/planning`, tab bar inchangée à 4 items) et me laisse la forme.

### 10.1 Forme retenue — une **row d'action** en fin de liste

| Propriété | Valeur |
| --------- | ------ |
| Conteneur | carte de la charte §4.3 : fond `--color-surface` `#1A1A1A`, `--radius-lg` (16), padding 16, aucune bordure, aucune ombre |
| Hauteur | ≥ 72 px |
| Gauche | carré 40 × 40, fond `--color-surface-raised` `#262626`, `--radius-md` (12), icône `Map` 20 px `--color-foreground` `#FFFFFF` |
| Titre | « **Carte des tracés** » — `--text-body-strong` (15/24 sans 600) `#FFFFFF` |
| Sous-titre | « Trouve un parcours autour de toi » — `--text-small` `--color-foreground-muted` `#A1A1AA` |
| Droite | `ChevronRight` 20 px `--color-foreground-subtle` `#8B8B94` |
| Balisage | `<Link href="/carte">` occupant toute la carte, `aria-label="Carte des tracés — trouve un parcours autour de toi"` |
| Focus | anneau violet standard de la charte §5 (ici le fond **est** contrôlé : `#0A0A0A`) |
| Placement | **après la dernière semaine affichée**, séparée du contenu par `space-8` (32 px), au-dessus de la marge basse `space-12` (48 px) |

### 10.2 Pourquoi cette forme

- **Un libellé visible plutôt qu'une icône seule.** C'est le critère décisif : la carte n'a **pas d'item
  de tab bar**, donc aucun rappel permanent de son existence. Un bouton-icône dans l'en-tête de
  `/planning` serait plus discret mais quasi indécouvrable pour une feature nouvelle. L'en-tête est par
  ailleurs déjà occupé (logo + titre, charte §6).
- **Cohérente avec le langage de cartes** du produit (charte §4.3), donc aucun composant nouveau à
  inventer.
- **En fin de liste, et pas en tête**, pour deux raisons : elle ne repousse pas le contenu principal du
  planning, et — surtout — la placer près d'une séance suggérerait un lien entre la carte et cette
  séance. Or la phase 1 est strictement lecture seule et **sans aucun lien avec le moteur** (ADR-018 §7,
  retrait du CTA « Utiliser pour ma séance »). La position neutre en fin de liste évite de promettre une
  fonctionnalité qui n'existe pas.
- **Limite assumée** : la découvrabilité dépend d'un défilement jusqu'en bas. Mesure corrective prévue —
  si le taux d'ouverture est faible, remonter la row en tête de liste ; c'est un changement d'une ligne,
  totalement réversible, et il ne remet en cause ni le composant ni le libellé.

### 10.3 Cohérence des libellés

Row « **Carte des tracés** » → en-tête de l'écran « **Carte** ». Le nom commun est partagé, la row le
qualifie. Ne pas introduire un troisième libellé (« Parcours », « Explorer ») ailleurs dans le produit.

---

## 11. Points à arbitrer par le fondateur

1. ~~**Ordre de priorité `Vélo > Route`, et sa conséquence visible.**~~ **Tranché par le fondateur le
   2026-09-06 : l'ordre proposé est conservé par défaut, et la décision définitive est reportée au point
   de validation de fin de L2**, pour être prise sur des données réelles de son terrain plutôt que sur une
   intuition. Le constat reste : avec les quatre filtres actifs, la plupart des voies revêtues dédiées
   admettant le vélo rendront en **jaune (Vélo)** et la teinte **cyan (Route) sera peu fréquente** — lecture
   défendue comme utile (*cyan = revêtu sans vélo*). L'inversion coûte le déplacement d'un élément dans une
   constante (`PRIORITÉ`, §3.1) : c'est précisément pourquoi l'arbitrage peut attendre des pièces.
2. ~~**Deux éléments non-champs dans la bottom sheet.**~~ **Tranché par le fondateur le 2026-09-06 :
   badges de sports conservés, lien OpenStreetMap retiré** (voir §6.5). Les badges relèvent d'une exigence
   **WCAG 1.4.1** — ils portent l'information de sport que la règle de priorité écrase visuellement (§3.5)
   — et ne sont donc pas retirables. Le lien OSM, lui, relevait d'un confort de traçabilité et non de la
   licence : l'obligation **ODbL** est déjà remplie par l'attribution globale du canevas (L1, ADR-018 §8).
   La bottom sheet reste à **trois champs + badges**.
3. **Le panneau « Liste des tracés » (§5.4) est un composant supplémentaire dans L3.** Il n'est pas
   nommé tel quel dans l'ADR, qui exige seulement « une alternative clavier au tap sur un tracé ». C'est
   la forme la plus utile que je vois, et elle sert aussi les utilisateurs à motricité fine réduite, mais
   elle a un coût de développement non nul. L'alternative minimale serait une liste focusable masquée
   visuellement — moins chère, nettement moins bonne.
4. **`--color-map-trail` `#F472B6` est à 30° de `--color-danger` `#F87171`**, et `--color-map-bike`
   `#FDE047` à 16° de `--color-warning` `#F59E0B`. Les deux collisions sont **cloisonnées par
   construction** (les tokens de carte ne vivent que dans le canevas, les tokens sémantiques que sur des
   surfaces opaques hors canevas) et je les considère résolues. Signalées ici parce qu'elles touchent la
   sémantique de couleur métier, qui est un domaine du fondateur.
5. **Aucune maquette Pencil n'a été produite.** Ce document est une spécification textuelle complète et
   suffisante pour L3. Si le fondateur veut une maquette Pencil de `/carte` alignée sur les nœuds validés
   existants, c'est un travail distinct à commander.
