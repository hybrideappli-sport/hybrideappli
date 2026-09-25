# Design — Écran Carte (phase 1, lecture seule)

- **Statut** : proposé — livrable `designer`
- **Date** : 2026-09-06, **révisé le 2026-09-09** (questions ouvertes n°3 et n°8 d'ADR-018),
  **amendé le 2026-09-10** (arbitrages du fondateur sur §11, points 5 et 8)
- **Répond à** : ADR-018, **question ouverte n°3** (« teintes des quatre tokens `--color-map-*`, rendu
  d'un chemin multi-sports », + **mise en avant des itinéraires nommés**, décision du fondateur du
  2026-09-09) et **question ouverte n°8** (« que fait la bottom sheet quand elle n'a rien à montrer ? »).
  **Débloque le lot L3.**
- **Dépend de** : `docs/design-system.md` (charte v1), ADR-018 §5 (classement), §6 (contrat de la route),
  §9 (attribution ODbL), §Alternatives écartées (chiffrage Toulon du 2026-09-09)
- **Ne modifie pas** : `docs/design-system.md`. L'ajout effectif des tokens à la charte est un travail
  `developer` en L3 (§9 de ce document donne le bloc exact à insérer).

> **Méthode et fiabilité des valeurs.** Aucune maquette Pencil n'a été produite ni ouverte pour ce
> document : il ne contient donc **aucune valeur de token Pencil**. Toutes les valeurs proviennent de
> quatre sources vérifiables — (a) `docs/design-system.md`, (b) le **style `alidade_smooth_dark` réel**,
> lu le 2026-09-06 sur `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json`, (c) les ratios de
> contraste WCAG 2.1 calculés à la main à partir de ces hex (formule de luminance relative, `(L1+0,05)/(L2+0,05)`),
> (d) **les mesures de fin de L2 sur la bbox réelle de Toulon** (6 tuiles z12, 7 115 tracés), reportées
> dans ADR-018 §Alternatives écartées et question 8. Les valeurs de luminance intermédiaires sont données
> en §2.2 pour être re-vérifiables.
>
> **Confirmé par le fondateur le 2026-09-10** : aucune maquette Pencil n'est commandée pour `/carte`.
> Ce document est la **source de vérité unique** de l'écran (§11, point 8).

> **Ce qui a changé le 2026-09-09.** Trois entrées nouvelles, toutes issues de mesures ou de décisions du
> fondateur, et deux d'entre elles **inversent** une hypothèse de la première passe :
>
> | Entrée | Effet sur ce document |
> | ------ | --------------------- |
> | **86 % des tracés sans nom, 73 % sans surface** (Toulon, 7 115 tracés) | **§6 est réécrit de fond en comble.** Le « cas dégradé » de l'ancien §6.4 devient la **forme nominale et unique** de la fiche. La pile de rows est retirée. |
> | **Volume réel : 7 115 tracés pour 6 tuiles** | **§5.4 est réécrit.** Le panneau « Liste des tracés » (liste plate plafonnée à 50) est **abandonné** : à ce volume, il n'est plus une alternative, c'est un mur. Remplacé par un **viseur de sélection** clavier. |
> | **Mise en avant des itinéraires nommés** (relations `type=route`), décision du fondateur | **§5.7, nouveau.** Épaisseur ×1,5 + nom écrit le long du tracé. Aucun cinquième canal visuel. |

> **Ce qui a changé le 2026-09-10.** Deux arbitrages du fondateur, tous deux portant sur §11 :
>
> | Décision | Effet sur ce document |
> | -------- | --------------------- |
> | **La mention « non renseignée » pour la surface est retenue** (§11, point 5) | **§6.3 s'aligne sur ADR-018** : la ligne de méta porte « Surface non renseignée » quand la surface est absente ou présumée. La divergence assumée du 2026-09-09 est levée, et §6.6 corrigé en conséquence. **ADR-018 n'est pas amendé** : il prescrivait déjà ce comportement. |
> | **Aucune maquette Pencil n'est commandée** (§11, point 8) | Aucun effet sur le contenu. La spécification textuelle reste **la source de vérité unique** de l'écran pour L3. |

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
   normative de rendu, pas une préférence** (§5.2). *Unique exception, spécifiée en §5.7 : la couche
   d'étiquettes des itinéraires nommés, qui est du texte et non un trait, et qui est placée **après** les
   symboles du fond précisément pour leur céder la priorité de collision.*

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

**Texte `#0A0A0A` sur remplissage** (pastille de filtre active, badge plein de la fiche de sélection) :

| Fond | Ratio | Verdict AA texte (≥ 4,5:1) |
| ---- | ----- | -------------------------- |
| `#0A0A0A` sur `#22D3EE` | 10,96:1 | ✅ AAA |
| `#0A0A0A` sur `#F472B6` | 7,48:1 | ✅ AAA |
| `#0A0A0A` sur `#E4E4E7` | 15,60:1 | ✅ AAA |
| `#0A0A0A` sur `#FDE047` | 15,02:1 | ✅ AAA |

Règle de la charte §5 confirmée sans exception : **le texte posé sur un remplissage clair est toujours
`#0A0A0A`, jamais blanc.**

**Texte de la famille sur `--color-surface` `#1A1A1A`** (badges en contour de la fiche, libellés de
légende) : colonne 2 ci-dessus, de 6,57:1 à 13,71:1 — **toutes AAA**. Aucune correction nécessaire, à la
différence du violet-500 traité en charte §5.

**Texte de la famille sur le canevas, avec halo `#0A0A0A`** (étiquettes des itinéraires nommés, §5.7) :
le halo de texte de 1,5 px rend le contraste local identique à la colonne 1 — de **7,48:1 à 15,60:1**,
donc AA texte largement franchi quel que soit le fond survolé. C'est la même mécanique que le halo de
trait, appliquée au texte.

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

La couleur n'est **jamais** le seul porteur d'information. Cinq canaux redondants, dans l'ordre de
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

   **Le motif est réservé au sport, et à rien d'autre.** C'est ce qui interdit d'utiliser un cinquième
   `dasharray` pour marquer les itinéraires nommés (§5.7) : ce canal est le filet de sécurité de la
   couleur, le surcharger d'une seconde signification le rend ininterprétable.

2. **Pastille de filtre = légende** — la pastille active affiche **un échantillon du trait réel**
   (segment de 16 px portant le motif du sport) à gauche de son libellé. La légende n'est donc pas un
   élément séparé à chercher : elle est dans le contrôle qui produit l'affichage (§4).
3. **Libellé textuel** — « Route », « Trail », « Rando », « Vélo » sont écrits en toutes lettres sur les
   pastilles, jamais réduits à une puce colorée.
4. **Fiche de sélection** — au tap sur un tracé, **tous** ses sports sont listés sous forme de badges
   textuels (§6.4). C'est le canal qui rattrape l'information écrasée par la règle de priorité du
   livrable 2, et il est disponible sur **100 % des tracés**, nommés ou non.
5. **Nom écrit le long du tracé** — pour les seuls itinéraires nommés (§5.7). Le canal le plus accessible
   qui soit, puisque c'est du texte.

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

**Effet de bord assumé, arbitrage reporté** : la plupart des voies revêtues dédiées (voies vertes, berges
aménagées) admettent le vélo. Avec les quatre filtres actifs, elles rendront donc en **jaune (Vélo)**, et
la teinte **cyan (Route) deviendra rare**. Ce n'est pas un défaut mais une lecture : *cyan = revêtu **sans**
vélo*, c'est-à-dire précisément les voies où un coureur ne croisera pas de cyclistes — une information
utile. **Tranché par le fondateur le 2026-09-06 : l'ordre est conservé par défaut**, décision définitive
reportée à des données de terrain (§11, point 1).

> **Ce que disent les chiffres de Toulon sur cet effet de bord.** Vélo = 592 tracés sur 7 115, contre
> Route = 3 109. L'inclusion `Route ⊇ Vélo` redoutée est donc **beaucoup plus faible que prévu** :
> l'identité Route ∪ Vélo compte 3 109 + 592 − 323 = 3 378 tracés, dont **323 seulement** portent les deux.
> Autrement dit, la priorité `Vélo > Route` ne « mange » le cyan que sur **10 %** des tracés revêtus.
> L'inquiétude de la première passe est largement levée, sur cette zone au moins.

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

La priorité **écrase** de l'information : un tracé Trail+Rando n'affiche qu'une teinte. Combien de tracés
sont concernés ? Les chiffres de Toulon permettent de le **calculer exactement** plutôt que de l'estimer :

```
Somme des appartenances : 3 109 (Route) + 2 659 (Trail) + 3 737 (Rando) + 592 (Vélo) = 10 097
Tracés distincts                                                                     =  7 115
Excédent d'appartenances                                                             =  2 982
```

Un tracé mono-sport contribue pour 1, un bi-sport pour 2, un tri-sport pour 3. Donc **au plus 2 982 tracés
sont multi-sports, soit 42 %** — et au moins **58 % des tracés ne portent qu'un seul sport**. (Borne haute :
elle est atteinte si aucun tracé ne porte trois sports ; chaque tri-sport la fait descendre.)

**Conséquence directe pour §6** : pour au moins 58 % des tracés, les badges de sports ne disent rien que le
trait ne dise déjà. Pour au plus 42 %, ils sont la **seule** source du ou des sports secondaires. C'est ce
chiffre — et non une intuition — qui justifie de conserver les badges sur **tous** les tracés : on ne peut
pas savoir *avant le tap* dans quel groupe on est, donc on ne peut pas conditionner leur affichage.

Deux compensations, toutes deux normatives :

1. **La fiche de sélection liste tous les sports** du tracé (§6.4), le badge du sport **effectivement rendu**
   étant **plein** et les autres **en contour**. L'utilisateur découvre la règle de priorité par
   l'exemple, sans documentation.
2. **L'annonce `aria-live`** après chaque changement de filtre porte le décompte par sport rendu :
   « 1 240 tracés affichés : 480 Vélo, 390 Trail, 370 Rando, dont 3 itinéraires balisés. » — c'est
   l'équivalent non visuel de la légende.

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
- **Un changement de filtre qui masque le tracé sélectionné le désélectionne** et ferme la fiche (§6.2) :
  laisser une fiche ouverte sur un tracé devenu invisible est un état incohérent.
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

**Épaisseurs de trait** (`line-width`, en px CSS) — c'est la valeur de **base**, celle d'un segment ;
les itinéraires nommés la multiplient par 1,5 (§5.7) et le tracé sélectionné par 1,35 (§5.5) :

```
BASE = ["interpolate", ["linear"], ["zoom"], 12, 2, 14, 2.5, 16, 3.5, 18, 5]
```

| Zoom | Segment | **Itinéraire nommé** (×1,5) | Halo (`line-width` du casing) |
| ---- | ------- | --------------------------- | ----------------------------- |
| 12 (zoom minimal) | 2,0 px | **3,0 px** | trait + 3 px |
| 14 | 2,5 px | **3,75 px** | trait + 3 px |
| 16 | 3,5 px | **5,25 px** | trait + 3 px |
| 18 et + | 5,0 px | **7,5 px** | trait + 3 px |

**Halo** — `--color-map-casing` `#0A0A0A`, `line-opacity: 0.9`, `line-blur: 0`, `line-cap`/`line-join:
round`, largeur = trait + 3 px (1,5 px de part et d'autre). **Le halo suit l'épaisseur du trait qu'il
borde**, donc il s'élargit lui aussi pour les itinéraires : c'est ce qui empêche le trait plus épais de se
retrouver moins bien détouré que les autres.

Trois précisions normatives :

1. **Le halo est toujours plein**, y compris sous un trait en tirets ou en pointillés. Les creux du motif
   laissent alors voir le noir, ce qui **renforce** la lisibilité du motif sur les zones claires du fond
   au lieu de la dégrader.
2. **Les tracés sont opaques** (`line-opacity: 1`), **sans exception au repos et sans exception à la
   sélection** (voir §5.5 : l'atténuation des tracés non sélectionnés est retirée). La seule dérogation
   restante est le rafraîchissement en cours (0,5 — §7.1), état transitoire et signalé : le contraste n'y
   est pas garanti, il ne doit jamais être l'état de repos.
3. **Insertion sous les étiquettes** : toutes les couches de **traits** sont ajoutées avec `beforeId` = **id
   de la première couche de type `symbol`** du style. Les toponymes du fond restent au-dessus. C'est ce
   qui autorise à exclure `#d4d4dc` du pire cas de contraste (§1). *La couche d'étiquettes des itinéraires
   (§5.7) fait exception et est ajoutée en dernier, en haut de la pile.*

### 5.3 Bouton flottant de recentrage

| Propriété | Valeur |
| --------- | ------ |
| Taille | 48 × 48 px, `--radius-full` |
| Position | bas-droite, 16 px du bord droit, **12 px au-dessus de la fiche de sélection si elle est ouverte, sinon 12 px au-dessus du bandeau d'attribution** + safe area |
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
| **actif** (vue centrée sur l'utilisateur) | icône `--color-accent` `#A78BFA` (6,4:1 sur `#1A1A1A` ✅ charte §5) |
| **refusé** (permission refusée) | icône `LocateOff` `--color-foreground-subtle` `#8B8B94`, `aria-disabled="true"` ; **le tap reste actif** et déclenche le bandeau explicatif de §7.8 — jamais un bouton mort |

**Marqueur de position** : disque 12 px `--color-accent` `#A78BFA`, anneau 2 px `#0A0A0A`, halo de
précision `rgba(167, 139, 250, 0.15)`. Le violet est ici légitime : c'est « moi/mon action », pas un sport.

### 5.4 Sélection au clavier — **viseur central**, et abandon du panneau « Liste des tracés »

> **Tranché par `designer` le 2026-09-09 (question 3, point résiduel).**
> **Le panneau « Liste des tracés » de la version précédente n'est pas retenu en L3.**
> Il est remplacé par un **viseur de sélection** au centre de la carte, plus léger à construire et — c'est
> le point — **le seul des deux qui tienne au volume réel**.

**Pourquoi l'abandonner, alors qu'il était présenté comme le mode d'accès principal d'une partie des
utilisateurs.** La mesure de fin de L2 a chiffré ce que la première passe ne pouvait qu'imaginer :
**7 115 tracés sur 6 tuiles**. Un viewport ordinaire en contient donc couramment plusieurs centaines à
plusieurs milliers. Or :

- une liste plate de plusieurs centaines de rows **« Chemin sans nom · 340 m »** n'est pas parcourable :
  aucune de ces rows n'est distinguable d'une autre, ni à l'œil ni à la synthèse vocale ;
- le plafond de 50 items que prévoyait la version précédente masquerait alors **plus de 90 % du contenu**
  visible à l'écran, sans que l'utilisateur puisse atteindre le reste autrement qu'en zoomant. C'est une
  **fausse affordance**, et elle frapperait exactement les utilisateurs qui n'ont pas d'autre voie
  d'accès. Une alternative d'accessibilité qui donne accès à 5 % du contenu est pire qu'un aveu franc ;
- le tri « par distance au centre de la vue » n'aide pas non plus : les 50 plus proches du centre d'un
  viewport dense tiennent dans un rayon de quelques dizaines de mètres.

**Le seul endroit où une liste fonctionne est celui où les objets sont peu nombreux et nommés** :
les itinéraires (§5.6). D'où la scission ci-dessous — l'alternative *générale* devient un viseur, et la
liste survit, **re-portée sur les itinéraires seuls**.

#### 5.4.1 Le viseur (obligatoire, c'est l'alternative exigée par ADR-018 L3)

- **Canevas focusable** : `tabindex="0"`, `role="application"`, `keyboard: true` dans les options
  MapLibre, double anneau de focus de §4.2 appliqué au conteneur.
- **Le viseur n'apparaît que lorsque le canevas a le focus clavier** (`:focus-visible`) — il ne pollue
  jamais l'usage tactile. Rendu, au centre exact du canevas :

  | Élément | Valeur |
  | ------- | ------ |
  | Cercle | ⌀ 20 px, trait 2 px `#FFFFFF` |
  | Détourage | liseré 1 px `#0A0A0A` à l'intérieur **et** à l'extérieur du cercle (⌀ effectif 24 px) — même doctrine que le halo de trait : le contraste devient indépendant du fond |
  | Croix centrale | 2 branches de 6 px, 1,5 px `#FFFFFF`, détourées de même, avec un vide de 4 px au centre pour ne pas masquer le tracé visé |
  | Cible tactile | aucune — c'est un repère, pas un contrôle |

- **Touches** (annoncées dans l'`aria-label` du canevas et dans l'aide de §5.4.2) :

  | Touche | Action |
  | ------ | ------ |
  | Flèches | déplacer la carte (comportement MapLibre natif) |
  | `+` / `−` | zoomer / dézoomer |
  | `Entrée` | **sélectionner** le tracé sous le viseur |
  | `N` / `P` | passer au tracé **suivant / précédent** parmi les candidats sous le viseur |
  | `Échap` | désélectionner et fermer la fiche ; un second `Échap` ne quitte pas le canevas (utiliser `Tab`) |

- **Ensemble de candidats** : `queryRenderedFeatures` sur une boîte de **44 × 44 px** centrée sur le
  viseur — plus large que la boîte tactile de 24 px, parce qu'un déplacement à la flèche est grossier et
  ne permet pas de viser au pixel. Ordre de parcours, **déterministe** :
  1. les itinéraires nommés d'abord (`isNamedRoute`, §5.7) ;
  2. puis par distance croissante du centre du viseur à la géométrie rendue ;
  3. à égalité, par `osmId` croissant.
  Le même ordre régit le choix au tap (le tap prend le premier candidat).
- **Sortie** : la sélection ouvre la fiche de §6 et est annoncée dans la zone `aria-live`. **Le focus ne
  quitte pas le canevas** — l'utilisateur clavier peut enchaîner `N`, `N`, `Entrée` sans jamais reprendre
  le focus ailleurs. C'est ce qui rend le parcours réellement praticable à ce volume : on balaie, on
  écoute, on s'arrête.

**Pourquoi c'est meilleur, et pas seulement moins cher** : le viseur transforme le panoramique en pointage.
Il passe à l'échelle sans plafond (il n'énumère jamais que ce qui est sous le réticule), il ne cache aucun
contenu, et il donne au clavier **exactement** le même résultat qu'un tap — même sélection, même fiche,
même annonce. La liste, elle, aurait donné un résultat différent (une sélection + un `fitBounds`), donc un
deuxième comportement à spécifier, à tester et à maintenir.

#### 5.4.2 Découvrabilité des touches

Les raccourcis `N` / `P` sont indécouvrables sans aide. Deux mesures, toutes deux obligatoires :

- **`aria-label` du canevas** : « Carte des tracés outdoor. Flèches pour se déplacer, plus et moins pour
  zoomer, Entrée pour sélectionner le tracé au centre, N et P pour passer au tracé suivant ou précédent,
  Échap pour désélectionner. »
- **Aide visible à la prise de focus** : gabarit A (§7), une ligne `--text-small`
  `--color-foreground-muted` — « Entrée : sélectionner au centre · N / P : tracé suivant · Échap :
  désélectionner » — affichée **tant que le canevas a le focus clavier**, retirée à la perte de focus.
  Elle n'apparaît jamais en usage tactile, donc elle ne coûte rien à l'écran mobile.

#### 5.4.3 Cible tactile

Le tap sur un tracé utilise `queryRenderedFeatures` sur une boîte de **24 × 24 px** centrée sur le point
touché (±12 px), ce qui satisfait **WCAG 2.2 SC 2.5.8 (Target Size Minimum, AA, 24 px)** sans ajouter de
couche de rendu invisible. Pour les utilisateurs à motricité fine réduite qui n'utilisent pas le clavier,
la voie praticable reste le **déplacement de la carte** (geste ample, aucune précision requise) suivi d'un
tap sur le tracé amené au centre — le viseur rend d'ailleurs cette stratégie explicite dès qu'il est
visible.

### 5.5 Tracé sélectionné

| Propriété | Valeur |
| --------- | ------ |
| Épaisseur | **× 1,35** de l'épaisseur que le tracé a déjà (donc ×1,35 pour un segment, ×1,5 × 1,35 = ×2,0 pour un itinéraire) |
| Halo | `--color-map-selected-casing` `#FFFFFF`, opacité 0,9, 2 px de part et d'autre |
| Teinte et motif | **inchangés** — la sélection ne change jamais le sport perçu |
| Nombre | un seul tracé sélectionné à la fois |

**Deux changements par rapport à la première passe, tous deux conséquences des décisions du 2026-09-09 :**

1. **Le multiplicateur passe de 1,6 à 1,35.** Avec les itinéraires nommés à ×1,5 (§5.7), un ×1,6 de
   sélection ferait qu'un **segment sélectionné (2 × 1,6 = 3,2 px)** paraîtrait **plus épais qu'un
   itinéraire non sélectionné (3,0 px)**. Les deux significations de l'épaisseur entreraient en collision.
   À ×1,35, l'ordre est préservé à tous les zooms : `segment < segment sélectionné < itinéraire <
   itinéraire sélectionné` (2 < 2,7 < 3 < 4,05 px au zoom 12). C'est un exemple de contrainte qui
   n'apparaît qu'en combinant deux décisions prises séparément — elle est notée ici pour ne pas être
   redécouverte en revue de code.
2. **L'atténuation des autres tracés à `line-opacity: 0.45` est retirée.** Elle avait un sens quand la
   sélection était un événement rare ouvrant une fiche occupant 45 % de l'écran. Elle n'en a plus quand la
   sélection devient une interaction **fréquente et bon marché** (§6.1) : faire clignoter la totalité de la
   carte à chaque tap est disproportionné, et cela dégradait les ratios de §2.2 sur des milliers d'objets.
   Le halo blanc suffit : à 19,6:1 contre le fond de l'application et contre les quatre teintes, il n'existe
   aucun autre élément blanc dans le canevas — la sélection est non ambiguë par construction.

**Contrainte de rendu inchangée** : le tracé sélectionné doit être **retiré des couches de base**
(`["!=", ["get","osmId"], selectedId]` ajouté à leurs filtres). Sans cela il serait dessiné deux fois, ce
qui produirait exactement le double halo que la contrainte L3 proscrit.

**Désélection** : tap sur le fond de carte hors de tout tracé, `Échap`, fermeture de la fiche, ou
disparition du tracé par changement de filtre (§4.3).

### 5.6 Liste des itinéraires balisés — la liste, re-portée là où elle fonctionne

**Statut : retenue en L3, mais explicitement dégradable.** Ce n'est **pas** l'alternative clavier exigée
par l'ADR (c'est le viseur de §5.4.1, non négociable). C'est une surface de **découvrabilité** des
itinéraires mis en avant par la décision du fondateur du 2026-09-09. Si L3 dérape, elle se reporte en
phase 2 sans toucher au reste — voir §11, point 3.

- **Déclencheur** : bouton flottant, même gabarit que §5.3, empilé **12 px au-dessus** de lui, icône
  `Signpost` 20 px, `aria-label="Itinéraires balisés (N)"`, `aria-expanded`.
  **Il n'existe que si au moins un itinéraire nommé est visible** — sinon il n'est pas rendu du tout (pas
  masqué, pas désactivé : absent). Pastille de décompte 16 px, fond `--color-foreground` `#FFFFFF`, texte
  `#0A0A0A`, `--text-label`, en haut à droite du bouton.
- **Panneau** : même conteneur que la fiche (§6.2), hauteur selon contenu, max 60 % de la hauteur d'écran.
  - Titre : « Itinéraires balisés (N) », `--text-heading`.
  - Rows de 56 px : à gauche un **échantillon de trait** 20 × 4,5 px (teinte + motif du `renderSport`, à
    l'épaisseur d'itinéraire), puis le nom en `--text-body-strong` `#FFFFFF`, puis en `--text-small`
    `--color-foreground-muted` la méta « 12,4 km · Rando ». Séparateur 1 px `--color-border` `#262626`.
  - Chaque row est un `<button>` ; activation ⟹ ferme le panneau, cadre la carte sur l'itinéraire
    (`fitBounds`, padding 48 px ; `jumpTo` si `prefers-reduced-motion`) et le sélectionne.
  - Tri par distance croissante au centre de la vue. **Aucun plafond n'est nécessaire** à ce volume
    (5 itinéraires sur les 6 tuiles de Toulon) ; garde-fou tout de même à 20 items, avec la mention
    « … et N autres. Zoome pour affiner. » en `--text-small` `--color-foreground-subtle`.
- **Focus** : piégé dans le panneau, `Échap` ferme, focus rendu au bouton déclencheur.

**Le contraste avec §5.4 est le point à retenir** : la même forme de composant est refusée sur 7 115 objets
anonymes et retenue sur 5 objets nommés. Ce n'est pas la liste qui était mauvaise, c'est son domaine.

### 5.7 Itinéraires nommés — le « trait plus marqué »

> **Décision du fondateur du 2026-09-09** : les relations OSM `type=route` sont **les points d'entrée
> reconnaissables de la carte** et doivent être mises en avant visuellement par un trait plus marqué.
> Contrainte que je m'impose : **aucun cinquième canal visuel.** La teinte porte le sport, le motif porte
> le sport (redondance WCAG 1.4.1), le blanc porte la sélection. Ces trois-là sont pris.

#### 5.7.1 La décision

> **L'itinéraire nommé garde exactement sa teinte et son motif. Il ne change que de poids, et il porte
> son nom.**
>
> 1. **Épaisseur × 1,5** (§5.2), halo élargi en conséquence.
> 2. **Nom écrit le long du tracé**, en couche `symbol` dédiée.

Rien d'autre. Pas de teinte spéciale, pas de motif spécial, pas de halo coloré, pas de contour clair.

#### 5.7.2 Le discriminant — zéro modification du contrat d'API

```
isNamedRoute(feature) = feature.properties.osmId.startsWith('relation/')
                        && feature.properties.name !== null
```

`osmId` a déjà la forme `'way/1234567' | 'relation/98765'` (ADR-018 §6) : **la relation est identifiable
sans ajouter le moindre champ à `MapTrailProperties`**. `isNamedRoute` est une propriété **calculée côté
client**, au même endroit et au même moment que `renderSport` (§3.1), et poussée par le même
`source.setData()`. Aucune requête, aucun champ, aucun ADR à amender.

**Un segment nommé n'est pas promu.** Seules les relations le sont. Deux raisons : (i) c'est ce que la
décision du fondateur désigne (`type=route`) ; (ii) et surtout, **la rareté est ce qui fait fonctionner
l'épaisseur**. À Toulon, 5 itinéraires pour 7 115 tracés : le trait épais se remarque. Si l'on y ajoutait
les ~1 000 segments nommés (14 %), un tracé sur sept serait épais et le signal disparaîtrait.

#### 5.7.3 Pourquoi l'épaisseur n'est pas un cinquième canal

L'épaisseur est déjà utilisée — par le zoom. Mais le zoom est **global** : à un instant donné, tous les
tracés sont à la même échelle. L'épaisseur **relative** est donc libre, et c'est elle qui porte le statut
éditorial. C'est une **modulation d'un canal existant**, pas un canal nouveau : elle ne demande aucune
légende, aucun apprentissage, et elle est comprise par convention cartographique universelle
(« plus épais = plus important »). Elle survit intégralement à toutes les déficiences de perception des
couleurs, y compris l'achromatopsie.

Elle a une limite honnête : **au zoom 12, l'écart est de 2 px contre 3 px** — perceptible, mais pas
frappant. C'est précisément la raison d'être du second renforcement.

#### 5.7.4 Le nom écrit le long du tracé

C'est le renforcement principal, et il n'introduit pas non plus de canal graphique : **c'est du texte**.
Un itinéraire dont on lit « Sentier du Littoral » sur la carte est un point d'entrée *reconnaissable* au
sens propre — ce que ne fera jamais un trait, si marqué soit-il.

| Propriété `symbol` | Valeur | Motif |
| ------------------ | ------ | ----- |
| `filter` | `["==", ["get","isNamedRoute"], true]` | jamais sur un segment |
| `symbol-placement` | `'line'` | le nom suit la géométrie |
| `symbol-spacing` | 400 px à z12, 250 px à partir de z14 | évite la répétition serrée au zoom minimal |
| `text-field` | `["get", "name"]` | — |
| `text-font` | police **semi-grasse du jeu de glyphes du style** — à relever dans le style Stadia par `developer` (§9.3) | MapLibre n'accepte que les polices servies par l'endpoint `glyphs` du style |
| `text-size` | `["interpolate",["linear"],["zoom"], 12, 11, 16, 13]` | plancher à `--text-caption` (11 px), plafond `--text-small` (13 px) |
| `text-letter-spacing` | `0.02em` | lisibilité sur trajectoire courbe |
| `text-color` | **la teinte du `renderSport`**, data-driven | le nom appartient au même objet que le trait : il en porte la couleur, il n'introduit donc aucune teinte nouvelle |
| `text-halo-color` | `--color-map-casing` `#0A0A0A` | — |
| `text-halo-width` | 1,5 px | rend le contraste **local**, donc indépendant du fond (§2.2, dernier paragraphe) |
| `text-halo-blur` | 0 | un halo flou dégrade le ratio calculé |
| `text-max-angle` | 38° (défaut) | pas d'étiquette sur un lacet |
| `text-padding` | 4 px | — |
| `text-allow-overlap` / `text-ignore-placement` | `false` (défaut) — **à ne pas passer à `true`** | c'est ce qui fait céder nos étiquettes devant les toponymes du fond |
| Zoom d'apparition | dès z12 | l'itinéraire doit être reconnaissable **au zoom minimal**, c'est là qu'il sert de point d'entrée |

**Placement dans la pile de couches — la seule exception à la règle de §1.** La couche d'étiquettes est
ajoutée **en dernier, au sommet de la pile**, et non `beforeId` la première couche `symbol`. C'est
contre-intuitif et c'est délibéré : dans MapLibre, la résolution des collisions entre symboles suit
**l'ordre des couches**, et les symboles déjà placés par les couches antérieures l'emportent. Placer notre
couche **après** les symboles du fond fait donc **céder nos étiquettes devant les toponymes** — exactement
la priorité voulue par §1. La placer avant les aurait masqués. Et comme les collisions sont résolues, les
deux ne se superposent jamais : l'ordre de dessin n'a aucune conséquence de contraste.

#### 5.7.5 Ce qui a été écarté pour « le trait plus marqué »

| Option | Rejet |
| ------ | ----- |
| **Teinte dédiée** (or, blanc, violet de marque) | Détruit l'invariant le plus fort de la carte — *teinte = sport* — pour 5 objets. Un itinéraire de rando et un itinéraire cyclable deviendraient indiscernables, alors que c'est justement l'information qui décide si on l'emprunte. Et le blanc est pris par la sélection. |
| **Cinquième motif de `dasharray`** (trait-point, par ex.) | Le motif est le **filet de sécurité de la couleur** (§2.4, canal 1). Lui faire porter une seconde signification le rend ininterprétable pour l'utilisateur daltonien ou monochrome, qui n'a que lui. C'est le rejet le plus net de la liste. |
| **Halo / glow coloré** (`line-blur` sur une couche en teinte du sport) | Le halo est déjà le mécanisme qui rend le contraste local calculable (§5.2). Un second halo flou et coloré par-dessus rend les ratios de §2.2 non calculables, sur les objets qu'on veut justement rendre les plus lisibles. |
| **Contour clair** (casing blanc ou gris clair permanent) | Occupe le canal de la sélection (§5.5). Il y aurait alors deux objets à halo clair simultanément, sans moyen de les distinguer. |
| **Atténuer les segments quand un itinéraire est visible** | Masquerait 86 % de la donnée pour mettre 5 objets en valeur, et dégraderait les ratios de §2.2 en permanence et non de façon transitoire. Contraire au principe de §5.2 point 2. |
| **Animation / trait en mouvement** | Interdit par `prefers-reduced-motion` pour une part des utilisateurs, donc non porteur d'information à lui seul ; et une animation permanente sur une carte est un coût de rendu continu. |
| **Épaisseur ×2 ou ×2,5** au lieu de ×1,5 | À z18, un itinéraire ferait 10 à 12,5 px de large et masquerait la voie qu'il suit, ainsi que les tracés qu'il croise. ×1,5 est la borne au-delà de laquelle le trait cesse de représenter un chemin pour devenir un bandeau. |

#### 5.7.6 Renforcements non graphiques (gratuits, et cumulatifs)

- **Badge « ITINÉRAIRE »** en tête des badges de la fiche de sélection (§6.4).
- **Priorité de sélection** : au tap comme au viseur, un itinéraire l'emporte sur les segments qui passent
  sous le même point (§5.4.1). C'est cohérent avec sa mise en avant : ce qu'on vise en tapant sur un trait
  épais, c'est le trait épais.
- **Liste dédiée** (§5.6).
- **Annonce `aria-live`** : le décompte de §3.5 se termine par « … dont 3 itinéraires balisés. », et
  l'annonce de sélection porte la mention « itinéraire balisé » (§6.5). **C'est l'équivalent non visuel du
  trait plus épais** — sans lui, la mise en avant n'existerait tout simplement pas pour un lecteur d'écran.

### 5.8 Attribution ODbL

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
recouvrir ce bandeau** : c'est une obligation de licence, pas une décoration.

**La fiche de sélection ne recouvre pas non plus le bandeau** : elle se pose **au-dessus** de lui, le
bandeau restant visible sous elle (§6.2). C'est le seul point où la fiche impose une contrainte de
composition, et il n'est pas négociable.

---

## 6. Fiche de sélection (la « bottom sheet »)

> **Cette section a été entièrement réécrite le 2026-09-09** en réponse à la **question ouverte n°8**
> d'ADR-018, et sur la consigne explicite du fondateur : **concevoir pour le tracé sans nom, sans surface,
> avec une seule distance, et traiter le tracé renseigné comme le cas rare.**
>
> La version précédente prévoyait ce cas (« Aucune donnée détaillée sur ce chemin ») **comme une
> exception**. La mesure en fait la règle : **86 % sans nom, 73 % sans surface**, dénivelé retiré
> (question 6). La conclusion n'est pas d'ajuster un cas limite, c'est de **changer d'objet** :
> ce qui s'ouvre n'est plus une fiche descriptive à laquelle il manque des champs, c'est une **étiquette
> d'identification** à laquelle il arrive d'en avoir plus.

### 6.1 La décision — **oui, elle s'ouvre toujours ; mais ce qui s'ouvre n'est plus une fiche**

> **Une seule forme, dimensionnée sur le cas majoritaire.** Toute sélection ouvre la même étiquette :
> **échantillon de trait + titre + une ligne de méta + badges de sports**. Hauteur fixe, pas de rows, pas
> de scroll, pas de poignée, **pas d'obligation de fermeture**.
> **Le tracé renseigné n'ouvre pas une autre surface : il remplit la même.**

**Réponse frontale à la question du fondateur.** L'objection était : *« elle coûte un geste à l'utilisateur
pour ne rien lui apprendre »*. Cette phrase contient en fait **deux** coûts, et ils ne se traitent pas
pareil :

| Coût | Traitement |
| ---- | ---------- |
| **Le geste d'ouverture** | Il n'existe pas. L'utilisateur n'ouvre pas une fiche : il **tape un tracé**, et il le fait pour une raison. L'ouverture est la réponse au geste, pas un geste de plus. |
| **Le geste de fermeture** | **C'est le vrai coût, et c'est lui qu'on supprime.** L'étiquette ne se ferme pas : elle se **remplace** au tap suivant, elle disparaît au tap sur le fond, elle n'occulte que 128 px en bas d'écran, elle ne piège pas le focus, elle ne bloque rien. On peut l'ignorer et continuer à explorer. |

Une fois le coût de fermeture supprimé, **l'argument « ne rien apprendre » ne suffit plus à justifier de ne
rien afficher**, parce que trois choses restent vraies même sur le tracé le plus pauvre :

1. **Un tap sans réponse est un défaut, pas une sobriété.** À 7 115 tracés à l'écran, l'utilisateur ne peut
   pas savoir *avant* de taper si le tracé est nommé. Une interaction qui répond une fois sur sept est
   perçue comme cassée, pas comme économe — et elle est indémontrable en recette (« ce tap ne fait rien :
   est-ce le comportement, ou un bug ? »).
2. **Les badges de sports ne sont pas redondants pour tout le monde.** §3.5 le chiffre : **jusqu'à 42 % des
   tracés portent un sport que le trait ne montre pas**, écrasé par la règle de priorité. Et on ne peut pas
   le savoir avant le tap. Conditionner l'ouverture au nom reviendrait à supprimer, pour l'essentiel des
   tracés, la compensation WCAG 1.4.1 que le fondateur a lui-même sanctuarisée le 2026-09-06.
3. **La distance seule est trompeuse si personne ne la qualifie.** C'est le point développé en §6.3 : sur un
   tracé sans nom, le nombre affiché n'est pas la longueur d'un chemin, c'est la longueur d'un **fragment
   OSM arbitraire**. Ne rien afficher laisse l'utilisateur avec un trait sans échelle ; afficher « 4,2 km »
   sec lui fait croire à un parcours. **Afficher « Portion de 340 m » est la seule des trois options qui ne
   ment pas.**

**Ce que la décision refuse explicitement**, et qui était dans la version précédente : une sheet de 45 % de
hauteur d'écran, une pile de rows `<dl>`, une poignée de redimensionnement, un focus déplacé à l'ouverture,
une atténuation de toute la carte. Tout cela est le vocabulaire d'une **fiche descriptive**, et il promet
un contenu qui n'existe pas 86 fois sur 100. **Le mensonge n'était pas dans les champs vides, il était dans
la taille du conteneur.**

**Options écartées :**

| Option | Rejet |
| ------ | ----- |
| **Ne rien ouvrir, retour visuel seul** | Un tap qui ne répond pas est indistinguable d'un tap raté (à 24 px de cible, le tap raté est fréquent). Supprime les badges de sports sur la totalité des tracés non nommés. Et n'offre aucune sortie non visuelle : le lecteur d'écran n'a plus rien du tout, alors que c'est justement le public qui ne peut pas « voir le tracé surligné ». Spécifié en §6.7 comme repli, si le fondateur préfère malgré tout. |
| **N'ouvrir que pour les tracés nommés** | Même défaut, aggravé d'une **incohérence apprise** : le même geste produit deux comportements selon une propriété invisible avant le geste. C'est la pire des trois options en termes de modèle mental. |
| **Ouvrir la fiche complète (version précédente), avec « Aucune donnée détaillée sur ce chemin »** | C'est l'option qui *dit* à l'utilisateur qu'on n'a rien, dans un conteneur dimensionné pour beaucoup. Elle transforme le cas nominal en aveu d'échec, 86 fois sur 100. |
| **Deux surfaces distinctes** (barre légère pour les pauvres, sheet complète pour les riches) | Deux composants, deux comportements, deux jeux de tests, et une transition visuelle brutale entre deux taps successifs. La forme unique obtient le même résultat avec un seul objet. |

### 6.2 Conteneur

| Propriété | Valeur |
| --------- | ------ |
| Fond | `--color-surface` `#1A1A1A` |
| Rayon | `--radius-lg` (16 px) **en haut uniquement** |
| Position | collée en bas, **au-dessus du bandeau d'attribution qui reste visible** (§5.8) |
| Largeur | pleine largeur moins les gouttières `space-5` (20 px de chaque côté) |
| Padding | `space-4` (16 px) tout autour |
| Hauteur | **fixe, ≈ 128 px** de contenu ; **max 154 px** si le nom passe à deux lignes. **Jamais de scroll interne, jamais de point d'ancrage secondaire.** |
| Ombre | `--shadow-overlay: 0 -8px 24px rgba(0, 0, 0, 0.6)` (charte §3.3, seule ombre déjà admise) |
| Poignée | **aucune** — voir ci-dessous |
| Fermeture | tap sur le fond de carte · `Échap` · bouton `✕` 24 px dans une cible 44 × 44 en haut à droite · glissement vers le bas (accepté mais non annoncé) |
| Remplacement | sélectionner un autre tracé **remplace le contenu sur place**, sans fermeture ni réouverture, sans animation d'entrée/sortie |

**Pourquoi pas de poignée.** Une poignée est la promesse d'un second point d'ancrage. Il n'y en a pas et il
n'y en aura pas : le contenu tient toujours en une hauteur. Afficher une poignée serait inviter à un geste
qui ne produit rien.

**Pourquoi 16 px de padding et non 20** (la valeur de carte de la charte §4.3) : la fiche est un objet de
survol posé sur la carte, pas une carte de contenu. 16 px la rend visiblement plus compacte que les cartes
du reste du produit, ce qui est l'information juste.

`prefers-reduced-motion` : apparition en fondu 120 ms, sans translation. Par défaut : translation de 16 px
+ fondu, 160 ms, `ease-out`. **Aucune animation à la substitution de contenu.**

### 6.3 Structure et contenu

```
┌────────────────────────────────────────────────────┐
│  ▬ ▬ ▬   Chemin sans nom                       ✕   │  ← échantillon + titre
│          Portion de 340 m · Surface non renseignée │  ← méta (une ligne)
│          [TRAIL] [Rando]                           │  ← badges (§6.4)
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│  ▬▬▬▬▬   Sentier du Littoral                   ✕   │  ← le cas RARE : même structure
│          12,4 km · Terre battue                    │
│          [ITINÉRAIRE] [Rando]                      │
└────────────────────────────────────────────────────┘
```

| Zone | Spécification |
| ---- | ------------- |
| **Échantillon de trait** | 20 × 3 px (segment) ou 20 × 4,5 px (itinéraire), portant la **teinte et le motif du `renderSport`**, halo `#0A0A0A` 1 px. Aligné sur la ligne de base du titre. C'est le **pont visuel** entre l'étiquette et le trait surligné sur la carte : sans lui, à densité forte, on ne sait pas de quel trait on parle. Il reprend exactement l'idiome de la pastille de filtre (§4.2) et des rows de §5.6. |
| **Titre** | `--text-heading` (sans 600, 20/26). Nom présent ⟹ `#FFFFFF`. Nom absent ⟹ « **Chemin sans nom** » en `--color-foreground-muted` `#A1A1AA` (6,8:1 ✅). Deux lignes maximum, puis `text-overflow: ellipsis`. |
| **Méta** | `--text-small` (13/18) `--color-foreground-muted`. **Une seule ligne**, faits séparés par ` · `, dans l'ordre : distance, puis surface. Un fait absent ne laisse **aucune trace** — ni tiret, ni séparateur orphelin — **à la seule exception de la surface**, qui porte depuis le 2026-09-10 une mention d'absence explicite (voir « Format de la surface » ci-dessous). |
| **Badges** | §6.4. Gap `space-2` (8 px), une seule ligne (maximum 4 badges + 1 « ITINÉRAIRE » : tient à 375 pt). |
| **Bouton `✕`** | 24 px d'icône dans une cible 44 × 44, `--color-foreground-muted`, `aria-label="Fermer les informations du tracé"`. Survol ⟹ `#FFFFFF`. Il est présent bien qu'il ne soit pas nécessaire : il est la seule sortie évidente pour qui n'a pas deviné le tap sur le fond. |

#### Format de la distance — **le seul endroit où ce document ajoute une information plutôt que d'en retirer**

| Cas | Rendu | Motif |
| --- | ----- | ----- |
| `name === null` | « **Portion de 340 m** » / « **Portion de 1,2 km** » | Dans OSM, une *way* est découpée arbitrairement à chaque changement de tag ou d'intersection. Un tracé sans nom n'est donc pas « un chemin » : c'est un **fragment** d'un chemin, et sa longueur est un artefact de cartographie, pas une donnée de terrain. Afficher « 340 m » sec laisserait croire à un parcours de 340 m. Le mot « portion » est **la seule chose que la fiche apporte réellement dans le cas majoritaire — et c'est ce qui justifie qu'elle s'ouvre.** |
| `name !== null` (way) | « **1,2 km** » | Un nom désigne un objet : la longueur en est la longueur. |
| `isNamedRoute` (relation) | « **12,4 km** » | Longueur de l'itinéraire complet (tag `distance` ou géométrie de la relation, ADR-018 §6). |
| `distanceKm === null` | *fait omis* | Cas dégénéré ; s'il est seul, la ligne de méta disparaît et la fiche perd 22 px. |

Format : `< 1 km` ⟹ « 850 m » (entier, pas de décimale) ; sinon « 4,2 km » (une décimale, **virgule**
fr-FR, espace insécable fine avant l'unité).

**Vérification falsifiable à faire en L3** : relever la **distance médiane des tracés sans nom**. Si elle
est de l'ordre de quelques centaines de mètres, l'hypothèse « fragment » est confirmée et le mot « portion »
est justifié. Si elle est de l'ordre du kilomètre, il faut le rouvrir. Cette mesure coûte une ligne de code
et tranche un choix de vocabulaire — elle n'a pas besoin d'attendre.

#### Format de la surface

| Cas | Rendu |
| --- | ----- |
| `surface !== null` **et** `surfaceInferred === false` | libellé fr de la table ci-dessous, ajouté à la méta après ` · ` |
| `surface === null` **ou** `surfaceInferred === true` (**73 % des cas**) | « **Surface non renseignée** », ajouté à la méta après ` · ` — mention explicite, **jamais** la valeur présumée |

> **Tranché par le fondateur le 2026-09-10 : la mention est affichée** (§11, point 5). Ce document
> s'aligne sur ADR-018 §5.2 et sur le tableau du lot L3, qui la prescrivaient déjà. **ADR-018 n'a besoin
> d'aucun amendement.** La formulation retenue est « Surface non renseignée » et non « Surface : — » :
> la méta est une ligne de faits, pas une pile de champs, et une phrase se lit comme une information
> tandis qu'un tiret se lit comme un trou.
>
> **Ce qui ne départageait pas les deux options.** Dans les deux, la surface **présumée n'est jamais
> affichée** — c'est un invariant du contrat (`surface: string | null`, ADR-018 §6), pas un arbitrage :
> la présomption sert au classement des sports, jamais à l'affichage. L'argument « une surface devinée
> peut envoyer quelqu'un en baskets sur du rocher » est donc satisfait par les deux options et **ne les
> discrimine pas**.
>
> **Ce qui tranche.** Une mention d'absence **explicite** dit à l'utilisateur « on ne sait pas, va
> vérifier », là où le silence peut se lire « rien à signaler ». Sur un terrain où la surface conditionne
> le choix des chaussures, l'absence explicite est le comportement sûr : c'est la seule des deux formes
> qui n'autorise pas une conclusion erronée par défaut.
>
> **Le coût accepté, et non contesté.** L'objection formulée le 2026-09-09 reste valable : à 73 %
> d'absence, cette mention fait de la ligne de méta un **inventaire de ce qu'on n'a pas**, dans l'esprit
> du défaut refusé pour le dénivelé le 2026-09-06. C'est le prix assumé de la décision, pas une erreur de
> raisonnement — deux éléments l'atténuent : la mention est **un fait dans une ligne** et non un champ
> d'une pile de rows (c'est là qu'un « — » permanent se lisait comme un bug), et elle nomme précisément
> ce qui manque au lieu d'avouer une absence globale.
>
> **Point à vérifier au rendu en L3** : à 375 pt, la ligne « Portion de 340 m · Surface non renseignée »
> fait ≈ 258 px pour ≈ 275 px disponibles (largeur d'écran moins gouttières, padding, échantillon et gap).
> Elle tient sur **une seule ligne**, mais la marge est faible et la hauteur fixe de §6.2 en dépend. Si
> elle passe à deux lignes sur un appareil étroit, la hauteur de la fiche suit la règle de « max 154 px »
> déjà prévue pour un titre à deux lignes — et non un scroll interne.

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

#### Aucun emplacement réservé au dénivelé

Conformément à la question 6 tranchée le 2026-09-06 : **rien n'est réservé**. En L4, le dénivelé
s'ajoutera comme un **fait de plus dans la ligne de méta** (« 12,4 km · Terre battue · D+ 420 m »), au même
titre que la surface, avec la même règle d'omission s'il est absent. Aucune retouche de mise en page.

**Garde-fou pour L4** : si la ligne de méta dépasse deux lignes à 375 pt avec quatre faits, elle bascule en
liste à puces verticale (`--text-small`, gap 2 px) et la hauteur de la fiche passe à ≈ 168 px. C'est la
seule évolution structurelle admise, et elle est spécifiée maintenant pour ne pas être improvisée.

### 6.4 Badges de sports — c'est ici que la règle de priorité se lit

Rangée de badges sous la méta, gap `space-2` (8 px), reprenant la charte §4.5 (contour 1 px,
`--text-label` 11 px majuscule tracké, `--radius-full`, padding 4/10).

| Badge | Rendu | Position |
| ----- | ----- | -------- |
| **« ITINÉRAIRE »** (si `isNamedRoute`) | contour 1 px et texte `--color-foreground` `#FFFFFF` (17,3:1 ✅) | **en premier** |
| Sport **effectivement rendu** (`renderSport`) | **plein** : fond `--color-map-<sport>`, texte `#0A0A0A` (7,5:1 à 15,6:1 ✅ §2.2) | ensuite |
| Autres sports du tracé | **contour** : 1 px et texte en `--color-map-<sport>` sur `#1A1A1A` (6,6:1 à 13,7:1 ✅ AAA) | dans l'ordre de priorité de §3.1 |
| Sport porté par le tracé mais **filtre décoché** | contour, en `--color-foreground-subtle` `#8B8B94` (5,2:1 ✅), avec `aria-label` « *(sport)*, filtre désactivé » | en dernier |

Le badge « ITINÉRAIRE » est **blanc et non coloré**, pour deux raisons : le blanc est le seul neutre
disponible qui ne soit pas déjà un sport ; et il porte la même valeur sémantique que le halo blanc de
sélection — *« ceci est l'objet distingué »*.

Cet ordre d'affichage est le micro-détail qui rend la règle de §3 **auto-explicative** : l'utilisateur voit
d'un coup d'œil que son tracé rose est aussi une Rando, sans qu'aucune documentation ne le lui dise.

### 6.5 Accessibilité de la fiche

| Point | Décision |
| ----- | -------- |
| Rôle | `<section role="region" aria-label="Tracé sélectionné">`. **Pas `role="dialog"`** : ce n'est ni modal, ni bloquant, ni piégeant. |
| Annonce | Le contenu est enveloppé dans la région `aria-live="polite"` unique de l'écran (§8). Toute sélection émet : « Sélection : *titre*, *méta*, *sports*. » |
| Exemple, cas majoritaire | « Sélection : chemin sans nom, portion de 340 mètres, Trail et Rando. » |
| Exemple, itinéraire | « Sélection : Sentier du Littoral, itinéraire balisé, 12,4 kilomètres, terre battue, Rando. » |
| **Focus** | **Le focus ne bouge pas à l'ouverture.** C'est un changement délibéré par rapport à la version précédente, qui le déplaçait sur le titre. À ce volume, la sélection est une action répétée : déplacer le focus à chaque tap ou chaque `Entrée` obligerait à revenir sur le canevas entre deux tracés, ce qui rend le parcours au viseur (§5.4.1) impraticable. La sortie non visuelle passe par `aria-live`, pas par le focus. |
| Ordre de tabulation | Le `✕` de la fiche s'insère dans l'ordre DOM **après** le canevas, avant les boutons flottants (§8). |
| Piège de focus | **Aucun.** Seul le panneau d'itinéraires (§5.6) en a un. |
| `Échap` | Désélectionne et ferme, depuis le canevas comme depuis le `✕`. |
| Cibles | `✕` = 44 × 44. Aucun autre élément interactif dans la fiche (les badges ne sont pas cliquables — un badge cliquable qui basculerait un filtre serait une action à effet lointain et non annoncé). |

### 6.6 Ce qui disparaît par rapport à la version du 2026-09-06

| Élément retiré | Motif |
| -------------- | ----- |
| Pile de rows `<dl>` Distance / Surface | Deux faits maximum. Un `<dl>` de deux rows à 44 px occupe 88 px pour dire ce qu'une ligne de 18 px dit mieux. La justification de §6.2 (« pile plutôt que grille, pour ne pas laisser de trou ») était juste **contre la grille** ; elle tombe face à une ligne de méta. |
| Cas limite « Aucune donnée détaillée sur ce chemin. » | **Il n'y a plus de cas limite** : le cas minimal *est* la forme nominale. Aucun état de la fiche n'affiche d'**aveu global** d'absence de données. *(Nuance du 2026-09-10 : la ligne de méta porte désormais une mention d'absence **ciblée** sur la surface — c'est un fait manquant nommé, pas un constat de vacuité.)* |
| ~~« Surface : non renseignée »~~ | **Rétabli le 2026-09-10** (§11, point 5) : la mention **ne disparaît pas**. Elle est affichée dans la ligne de méta sous la forme « Surface non renseignée » (§6.3), conformément à ADR-018. Ligne conservée barrée pour garder trace de la révision du 2026-09-09. |
| Hauteur max 45 % de l'écran, scroll interne | Un conteneur dimensionné pour un contenu qui n'existe pas. |
| Poignée de redimensionnement | Promesse d'un second point d'ancrage inexistant. |
| `role="dialog"`, focus déplacé sur le titre, restitution du focus | Vocabulaire modal, inadapté à une interaction répétée et non bloquante. |
| Lien « Voir sur OpenStreetMap » | Déjà retiré le 2026-09-06 par le fondateur (obligation ODbL remplie par l'attribution globale). |

### 6.7 Variante de repli — si le fondateur préfère malgré tout « ne pas ouvrir »

Spécifiée pour que le choix reste réversible à faible coût, et parce que le fondateur a explicitement
demandé le retour visuel de sélection dans cette hypothèse. **Ce n'est pas ma recommandation.**

- **Le retour visuel de sélection est celui de §5.5, inchangé et indépendant de la fiche** : halo blanc
  `#FFFFFF` 2 px de part et d'autre, épaisseur × 1,35, teinte et motif conservés, aucune atténuation des
  autres tracés. Il est déjà spécifié et déjà implémenté séparément de la fiche : basculer ne touche donc
  qu'un `if`.
- **En complément obligatoire, une pill transitoire** (gabarit A de §7, une ligne, `--text-small`
  `--color-foreground-muted`), affichée en haut de la carte pendant **4 s** puis retirée en fondu :
  « Chemin sans nom · portion de 340 m · Trail, Rando ». Elle porte le même texte que l'annonce
  `aria-live`, qui reste **obligatoire dans tous les cas**.
- **Ce que la variante coûte, à accepter par écrit si elle est retenue** : (i) les badges de sports
  disparaissent en tant qu'objets stables — le sport secondaire ne serait lisible que pendant 4 s ;
  (ii) un tap qui rate le tracé de 2 px devient indistinguable d'un tap réussi sur un tracé pauvre ;
  (iii) la mention « portion de » n'est plus lisible que fugitivement, alors que c'est la seule protection
  contre la lecture erronée de la distance.
- **La variante « n'ouvrir que si le tracé a un nom » n'est pas spécifiée** et je recommande de ne pas la
  retenir : elle fait dépendre le comportement d'une propriété que l'utilisateur ne peut pas observer avant
  d'agir, ce qui est le défaut le plus coûteux des trois.

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

**Latence mesurée à froid : 19,3 s sur 6 tuiles** (ADR-018, chiffrage du 2026-09-09). C'est très long, et
la pill de §7.1 doit donc rester **visible et stable** pendant toute cette durée — sans message qui change,
sans barre de progression fausse. Si `developer` constate en L3 que la latence à froid dépasse
régulièrement 10 s, ajouter au bout de **8 s** une seconde ligne `--text-small`
`--color-foreground-subtle` : « Première exploration de cette zone — c'est plus long. » Une attente longue
expliquée n'est pas une panne ; une attente longue muette l'est.

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
| **(b) Tout masqué par les filtres** | `trails.length > 0` et 0 rendu, ≥ 1 filtre actif | « **1 240 tracés masqués par tes filtres.** » + bouton secondaire « Tout afficher » |
| **(c) Aucun filtre actif** | 0 filtre actif | « **Aucun sport sélectionné.** » + « Choisis au moins un sport pour voir les tracés. » + bouton secondaire « Tout afficher » |

Afficher (a) alors qu'on est en (b) est un défaut fonctionnel, pas une approximation de rédaction :
l'utilisateur en conclurait à tort qu'il n'y a rien autour de lui. Le décompte de (b) est **le nombre réel
de tracés reçus**, pas une formule vague ; il est formaté avec une espace insécable fine comme séparateur
de milliers, les volumes mesurés étant à quatre chiffres.

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

**À surveiller en L3** : avec 7 115 tracés sur 6 tuiles, `MAX_FEATURES_PER_TILE` (ordre de grandeur 2 000)
est franchi sur une tuile urbaine dense. **Cet état n'est donc pas rare, il est probablement fréquent** en
ville. Si la mesure le confirme, il faut le remonter du statut « mention discrète » à celui de bandeau
persistant — ce qui est un changement d'une ligne dans le gabarit, mais un changement de statut à faire
consciemment.

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
| **SC 1.4.11** — contraste non textuel ≥ 3:1 | §2.2 : de 3,45:1 à 7,21:1 dans le pire cas de fond de carte ; viseur et halo blanc détourés de noir (§5.4.1, §5.5) |
| **SC 1.4.3** — contraste texte ≥ 4,5:1 | §2.2 (pastilles, badges), §2.2 dernier § (étiquettes d'itinéraires, halo 1,5 px), §5.8 (attribution : 5,26:1 composite) |
| **SC 1.4.1** — la couleur n'est jamais seule | §2.4, cinq canaux : motif de trait · échantillon dans la pastille · libellé écrit · badges de la fiche (sur **100 %** des tracés, §6.1) · nom écrit le long des itinéraires |
| **SC 2.5.8** — cible ≥ 24 px | §5.4.3 : boîte de sélection 24 × 24 px au tap ; 44 × 44 px au viseur |
| **Cibles tactiles ≥ 44 px** (charte §5) | pastilles 44, contrôles flottants 48, rows du panneau d'itinéraires 56, `✕` de la fiche 44 |
| **Focus visible** | **double anneau** blanc 2 px + offset noir 4 px, unique pour tout l'écran (§4.2) — le violet de la charte ne peut pas garantir le contraste sur un fond de carte |
| **Alternative clavier au tap** (exigence ADR-018 L3) | **§5.4.1, viseur central** : `Entrée` sélectionne, `N`/`P` parcourent les candidats, `Échap` désélectionne. Produit **exactement** le même résultat qu'un tap. |
| **Découvrabilité des raccourcis** | §5.4.2 : `aria-label` d'instructions sur le canevas + aide visible tant que le canevas a le focus |
| **Carte navigable au clavier** | canevas `tabindex="0"`, `role="application"`, `keyboard: true` |
| **Mise en avant des itinéraires, en non-visuel** | badge « ITINÉRAIRE » (§6.4), mention « itinéraire balisé » dans l'annonce de sélection (§6.5), décompte « dont N itinéraires balisés » (§3.5), liste dédiée (§5.6) |
| **Zones live** | une seule région `aria-live="polite"` (jamais `assertive`) : décompte après chargement / changement de filtre / fin de panoramique ; **annonce de sélection** (§6.5) ; états de §7 |
| **Ordre du focus** | retour → titre → 4 pastilles → canevas → `✕` de la fiche (si ouverte) → bouton Itinéraires (si présent) → bouton Recentrer → attribution ; ordre DOM = ordre visuel |
| **`prefers-reduced-motion`** | `flyTo` → `jumpTo` (recentrage et cadrage) ; fiche en fondu sans translation ; spinner ralenti, pas supprimé ; aucune transition de teinte au changement de filtre |
| **Piège de focus** | uniquement dans le panneau d'itinéraires (§5.6). **La fiche de sélection n'en a pas et ne déplace pas le focus** (§6.5) — condition pour que le parcours au viseur reste praticable |
| **Restitution du focus** | à la fermeture du panneau d'itinéraires, le focus revient sur son bouton déclencheur |

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

Y déclarer également, pour la même raison, les **multiplicateurs d'épaisseur** : `WIDTH_BASE`,
`WIDTH_ROUTE_MULTIPLIER = 1.5` (§5.7), `WIDTH_SELECTED_MULTIPLIER = 1.35` (§5.5). L'invariant
`base < base × 1.35 < base × 1.5 < base × 1.5 × 1.35` mérite un test unitaire d'une ligne : c'est lui qui
empêche qu'un futur ajustement fasse se croiser les deux significations de l'épaisseur.

### 9.2 Contrainte d'implémentation : `line-dasharray` n'est pas *data-driven*

`line-dasharray` n'accepte pas d'expression sur les propriétés d'entité dans MapLibre GL JS (seulement des
expressions de zoom). Le motif de trait ne peut donc pas être choisi dans une couche unique.
**En revanche, `line-width` est data-driven** : les multiplicateurs de §5.5 et §5.7 ne coûtent donc
**aucune couche supplémentaire**.

**Empilement retenu — 8 couches, chaque entité dessinée exactement une fois par groupe :**

| # | Couche | Filtre | `beforeId` | Rôle |
| - | ------ | ------ | ---------- | ---- |
| 1 | `trails-casing` | `["all", ["has","renderSport"], ["!=",["get","osmId"], selectedId]]` | 1ʳᵉ `symbol` | halo unique, **toujours plein**, largeur = trait + 3 px |
| 2 | `trails-line-hike` | `["==",["get","renderSport"],"hike"]` + exclusion du sélectionné | 1ʳᵉ `symbol` | pointillé |
| 3 | `trails-line-route` | `… "route"` | 1ʳᵉ `symbol` | plein |
| 4 | `trails-line-trail` | `… "trail"` | 1ʳᵉ `symbol` | tirets courts |
| 5 | `trails-line-bike` | `… "bike"` | 1ʳᵉ `symbol` | tirets longs |
| 6 | `trails-selected-casing` | `["==",["get","osmId"], selectedId]` | 1ʳᵉ `symbol` | halo blanc |
| 7 | `trails-selected-line` | idem | 1ʳᵉ `symbol` | trait × 1,35, motif et teinte du sport conservés |
| 8 | `trails-route-labels` | `["==",["get","isNamedRoute"], true]` | **aucun — ajoutée en dernier** | nom le long du tracé (§5.7.4) |

Expression d'épaisseur commune aux couches 1 à 5 :

```
["*",
  ["interpolate", ["linear"], ["zoom"], 12, 2, 14, 2.5, 16, 3.5, 18, 5],
  ["case", ["==", ["get", "isNamedRoute"], true], 1.5, 1]
]
```

Les couches 6 et 7 reprennent la même expression, multipliée par 1,35.

**L'invariant « dessiné une seule fois » est garanti par construction** : `renderSport` est une valeur
**scalaire** par entité, donc les filtres des couches 2 à 5 **partitionnent** l'ensemble ; et le tracé
sélectionné est explicitement exclu des couches 1 à 5. Aucune superposition, aucun double halo, aucun
aliasing. C'est vérifiable par un test unitaire sur les filtres (leur intersection deux à deux est vide),
pas seulement à l'œil. La couche 8 ne dessine aucun trait : elle n'entre pas dans l'invariant.

**Les deux propriétés calculées côté client** — `renderSport` (§3.1) et `isNamedRoute` (§5.7.2) — sont
produites au même endroit, recalculées ensemble et poussées par un unique `source.setData()`. Aucune des
deux n'existe dans `MapTrailProperties` : **le contrat d'ADR-018 §6 n'est pas modifié.**

### 9.3 Contrainte d'implémentation : la police des étiquettes

`text-font` doit nommer une police **servie par l'endpoint `glyphs` du style Stadia**. Les noms
(« Stadia Semibold », « Noto Sans Semibold »…) sont à relever dans le JSON du style au moment de L3 ;
n'y mettre ni « Inter » ni une famille CSS, qui ne seraient pas résolues et feraient disparaître les
étiquettes **silencieusement**. Prévoir une liste de repli à deux entrées, et un test qui vérifie
qu'au moins une étiquette d'itinéraire est rendue sur une fixture contenant une relation nommée.

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

1. ~~**Ordre de priorité `Vélo > Route`, et sa conséquence visible.**~~ **Tranché le 2026-09-06 : l'ordre
   proposé est conservé par défaut**, décision définitive reportée à des données de terrain.
   **Mise à jour du 2026-09-09** : les chiffres de Toulon **atténuent nettement l'inquiétude** — seuls
   323 tracés sur 3 378 revêtus portent les deux sports, donc le cyan reste largement visible (§3.3).
   L'inversion coûte le déplacement d'un élément dans une constante.

2. ~~**Deux éléments non-champs dans la bottom sheet.**~~ **Tranché le 2026-09-06 : badges de sports
   conservés, lien OpenStreetMap retiré.** Les badges relèvent d'une exigence **WCAG 1.4.1** — §3.5 le
   chiffre désormais : jusqu'à **42 %** des tracés portent un sport que le trait ne montre pas. Le lien OSM
   relevait d'un confort de traçabilité, l'obligation **ODbL** étant remplie par l'attribution globale du
   canevas.

3. ~~**Le panneau « Liste des tracés » est un composant supplémentaire dans L3.**~~ **Tranché par
   `designer` le 2026-09-09 (§5.4) : le panneau n'est pas retenu.** Le volume mesuré (7 115 tracés sur
   6 tuiles) le rend inutilisable — un plafond à 50 items masquerait plus de 90 % du contenu visible,
   ce qui est une fausse affordance pour les utilisateurs qui n'ont pas d'autre voie d'accès.
   Remplacé par le **viseur de sélection** (§5.4.1), qui passe à l'échelle, ne cache rien, et donne au
   clavier exactement le même résultat qu'un tap.
   **Ce qui reste soumis au fondateur** : la **liste des itinéraires balisés** (§5.6) est retenue en L3
   mais elle est un confort de découvrabilité, **pas** l'exigence d'accessibilité de l'ADR. Elle est
   **reportable en phase 2 sans rien casser** si L3 doit être resserré. Le viseur, lui, n'est pas
   négociable — c'est l'alternative clavier exigée.

4. **`--color-map-trail` `#F472B6` est à 30° de `--color-danger` `#F87171`**, et `--color-map-bike`
   `#FDE047` à 16° de `--color-warning` `#F59E0B`. Les deux collisions sont **cloisonnées par
   construction** (les tokens de carte ne vivent que dans le canevas, les tokens sémantiques que sur des
   surfaces opaques hors canevas) et je les considère résolues. Signalées ici parce qu'elles touchent la
   sémantique de couleur métier, qui est un domaine du fondateur.

5. ~~**⚠️ Divergence à faire amender dans ADR-018 : la mention « non renseignée » pour la surface.**~~
   **Tranché par le fondateur le 2026-09-10 : la mention est affichée.** C'est **ADR-018 qui l'emporte et
   ce document qui s'aligne** (§6.3, §6.6). **ADR-018 ne reçoit aucun amendement** : §5.2 et le tableau du
   lot L3 prescrivaient déjà exactement ce comportement.
   - **Ce qui ne départageait pas les deux options** : dans les deux, la surface **présumée n'est jamais
     affichée** — c'est un invariant du contrat (ADR-018 §6), pas un arbitrage, la présomption ne servant
     qu'au classement des sports. L'argument « une surface devinée peut envoyer quelqu'un en baskets sur
     du rocher » est donc satisfait par les deux options et **ne les discrimine pas**.
   - **Ce qui tranche** : une mention d'absence **explicite** dit « on ne sait pas, va vérifier », là où
     le silence peut se lire « rien à signaler ». Sur un terrain où la surface conditionne le choix des
     chaussures, l'absence explicite est le comportement sûr.
   - **Coût accepté, et non contesté** : l'objection de `designer` reste valable — à 73 % d'absence, la
     mention fait de la fiche un inventaire de ce qu'on n'a pas. Le fondateur l'assume comme le prix de la
     décision, non comme une erreur de raisonnement.
   - *Position d'origine de `designer` (2026-09-09), conservée pour mémoire* : « **§6.3 ne le retient
     pas** : à 73 % de taux d'absence, cette mention transforme la fiche en inventaire de ce qu'on n'a pas
     — exactement le défaut que le fondateur a refusé pour le dénivelé le 2026-09-06. L'intention de l'ADR
     (“on ne fabrique pas une donnée qu'OSM ne porte pas”) est intégralement respectée : la valeur
     présumée n'est jamais affichée. Seule la mention d'absence disparaît. »

6. **Le vocabulaire « Portion de … » (§6.3) est un choix de contenu, pas de style.** Il repose sur le fait
   qu'une *way* OSM sans nom est un fragment arbitraire et non un chemin. C'est ce qui justifie que la
   fiche s'ouvre dans le cas majoritaire. **Vérification falsifiable prévue en L3** (distance médiane des
   tracés sans nom). Si le fondateur préfère une formulation différente — « Tronçon de … », ou la distance
   seule — c'est une chaîne à changer, mais **supprimer la qualification est un choix éditorial qui rend la
   distance trompeuse**, et je le déconseille.

7. **La troncature (`truncated`) sera probablement fréquente en ville** et non exceptionnelle (§7.6) :
   7 115 tracés sur 6 tuiles contre un `MAX_FEATURES_PER_TILE` de l'ordre de 2 000. À confirmer en L3 ;
   si c'est le cas, l'état passe de « mention discrète » à « bandeau persistant ». Changement d'une ligne,
   mais changement de statut.

8. ~~**Aucune maquette Pencil n'a été produite.**~~ **Tranché par le fondateur le 2026-09-10 : aucune
   maquette Pencil n'est commandée.** La spécification textuelle de ce document est **suffisante pour L3**,
   et `docs/design-carte.md` est la **source de vérité unique** de l'écran Carte.
   **Motif** : Pencil et le code ont **déjà divergé une fois**, et le fondateur refuse de maintenir deux
   sources de vérité pour un même écran.
   **Conséquence pour L3** : `developer` n'a aucun nœud Pencil à ouvrir pour `/carte` ; toute question de
   rendu se tranche sur ce document. *Argumentaire d'origine, conservé : « Si le fondateur veut une
   maquette Pencil de `/carte` alignée sur les nœuds validés existants, c'est un travail distinct à
   commander. » — il ne l'a pas commandé.*
