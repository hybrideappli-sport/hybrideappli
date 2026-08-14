# ADR-014 — Score hybride : formule paramétrée, calcul pur, calibration explicite

- **Statut** : Accepté
- **Date** : 2026-08-12
- **Décideur** : `architect`
- **Portée** : Projet — métrique produit
- **Dépend de** : ADR-002 (isolation du moteur), ADR-004 §4 (`load_units`), ADR-006 (auditabilité), ADR-007 (paramètres versionnés)
- **Feature déclenchante** : US-02, AC7 / AC8 / AC9 — question ouverte §7 « formule de calcul », explicitement déléguée à `architect`

---

## Contexte

La fiche US-02 rattache le score hybride à cette feature et **délègue sa formule à `architect`** (§7, tranché par le fondateur le 2026-08-11) :

> pas de formule figée, `architect` propose un défaut raisonnable (agrégation `load_units`), ajustable ultérieurement comme les seuils de garde-fous de F1.

La proposition citée à titre d'exemple dans l'AC7 est « une somme pondérée à parts égales entre disciplines sur une fenêtre glissante de 7 jours ». Trois exigences encadrent le choix :

- **AC7** : agréger les `load_units` de toutes les disciplines en **un** indicateur, présenté comme un *signal de progression global*, pas comme une moyenne de métriques disparates ;
- **AC8** : sous un seuil de données, afficher explicitement un état de **calibration**, jamais un chiffre non représentatif ;
- **AC9** : le score n'est jamais bloquant, et **une donnée déclarée vaut une donnée connectée**.

Le design (`09-design-feature2-notes.md` §4) fixe le contenant : un anneau **0-100**, un delta signé « vs semaine dernière », un histogramme de volume sur 7 jours, une répartition par discipline en pourcentage, et un état de calibration « 2 semaines sur 4 ». La formule doit alimenter exactement ces objets.

---

## Décision

### 1. Trois composantes normalisées, agrégées par une somme pondérée sur 0-100

```
HS = round( 100 × ( w_v·V + w_r·R + w_d·D ) )      avec w_v + w_r + w_d = 1
```

**V — charge soutenue** (la matière première demandée par l'AC7)

```
L_chronic = moyenne des load_units hebdomadaires réalisées sur les 28 derniers jours
V = min( 1 , ln(1 + L_chronic / ref) / ln 2 )      ref = chronic_load_reference_units
```

Courbe concave, saturante, plafonnée à 1 : un athlète qui double son volume gagne beaucoup quand il part de bas, peu quand il est déjà chargé, et **rien du tout au-delà de la référence**. Le score ne récompense donc jamais la surcharge — cohérent avec l'AC8, qui plafonne la progression, et avec un produit qui refuse d'inciter à en faire trop.

**R — régularité**

```
R = min( 1 , jours d'entraînement distincts sur 28 j / target_active_days_per_28d )
```

Compte les **jours réellement actifs**, pas le taux de respect du plan. C'est délibéré : un score d'observance jugerait l'utilisateur, et l'AC6 de la F1 interdit déjà de durcir un plan en réponse à une inobservance. Une séance faite hors plan compte exactement comme une séance planifiée.

**D — hybridité**

```
p_d = part de load_units de la discipline d sur 28 j
D   = min( 1 , −Σ p_d·ln(p_d) / ln(diversity_reference_disciplines) )
```

Entropie de Shannon normalisée. `D = 0` pour une discipline unique, `D = 1` pour trois disciplines équilibrées. C'est la composante qui rend le score *hybride* plutôt que « volume d'entraînement », et le design la reflète déjà (`S-split-card`, et la phrase « le score hybride prend tout son sens à partir de deux »).

**Valeurs par défaut proposées** (toutes paramétrées, aucune en dur) :

| Paramètre | Défaut | Justification du défaut |
|---|---|---|
| `weights.volume` | `0.5` | La charge est l'objet de l'AC7 ; elle domine sans écraser. |
| `weights.consistency` | `0.3` | La régularité est le levier de progression le plus accessible à un amateur. |
| `weights.diversity` | `0.2` | Suffisant pour être visible, assez faible pour ne pas humilier un mono-discipline. |
| `chronic_load_reference_units` | `700` | ≈ 10-12 h hebdomadaires d'entraînement mixte. Calé pour qu'un amateur sérieux (≈ 400 UA/semaine, valeur des maquettes) atterrisse vers 75-80, et que 100 reste hors de portée sans être théorique. |
| `target_active_days_per_28d` | `20` | 5 jours actifs par semaine. |
| `diversity_reference_disciplines` | `3` | Trois disciplines équilibrées = hybridité pleine. |
| `acute_window_days` | `7` | Fenêtre d'affichage du volume hebdomadaire et du delta de la carte volume. |
| `chronic_window_days` | `28` | Fenêtre du score (voir §2). |
| `calibration_min_weeks` | `4` | Aligné sur `stagnation.calibration_min_weeks` de la F1 (voir §4). |
| `min_sessions_for_score` | `4` | Quatre semaines écoulées avec deux séances ne sont pas « des données comparables ». |

### 2. Le score est calculé sur 28 jours, pas sur 7 — l'affichage reste hebdomadaire

C'est l'unique écart avec l'exemple cité par la fiche, et il est délibéré.

Un score sur 7 jours glissants s'effondre mécaniquement pendant une **semaine de décharge** — laquelle est *imposée* par l'AC8 de la F1 et non désactivable. Le produit afficherait alors « ta progression chute » précisément quand le coach vient d'ordonner de lever le pied : le score contredirait le coach, sur le seul écran censé résumer la progression. Il chuterait de la même façon pour une semaine de voyage, alors que rien n'est perdu physiologiquement.

La fenêtre de 28 jours lisse ces creux tout en restant réactive (une semaine pèse un quart du score). Elle a aussi l'avantage d'être **la même fenêtre que le diagnostic de stagnation de la F1** (`stagnation.rolling_window_weeks = 4`) : deux indicateurs qui parlent de progression sur des horizons différents auraient été une source de contradiction perçue.

La fenêtre de **7 jours reste celle de l'affichage** : `S-volume-card` (« 412 UA », « +8 % vs S-1 », histogramme des 7 jours) et le delta du score (« ↑ +4 vs semaine dernière ») sont servis avec `acute_window_days`.

**Le delta est recalculé, pas relu.** `HS(J) − HS(J−7)` est obtenu en réexécutant la fonction pure sur la fenêtre décalée de 7 jours, jamais en lisant une ligne d'historique. Sans quoi le delta serait absent pour tout utilisateur n'ayant pas ouvert l'application il y a exactement une semaine — un défaut d'affichage causé par un choix de stockage.

### 3. La formule vit dans `rulesets.params`, le calcul dans le moteur pur

**Paramètres** : nouvelle section `hybrid_score` de `rulesets.params` (ADR-007), donc versionnée, immuable, référencée par `ruleset_version` sur chaque score persisté. Un score de mars reste explicable avec la formule de mars. Ajuster une pondération = publier une nouvelle version de ruleset, sans déploiement.

Deux nuances par rapport à l'ADR-007 :

- ces paramètres **ne sont pas des garde-fous de sécurité** : ils portent des valeurs par défaut concrètes plutôt que des `null` bloquants. Une pondération mal calibrée dégrade un affichage, elle ne blesse personne ;
- la section est **optionnelle dans `RulesetParamsSchema`**, avec valeurs par défaut appliquées à la lecture, pour que le ruleset `0.1.0-dev` de la F1 reste valide au rejeu d'un plan ancien. Les paramètres F2 sont publiés dans une **nouvelle version `0.2.0-dev`** : on ne modifie jamais une version existante (ADR-007 §1).

**Calcul** : fonction pure `computeHybridScore(context, ruleset)` exportée par `@hybride/rules-engine`, au même titre que `evaluateStagnation` ou `evaluateFreeAccess` (`08-architecture.md` §4.1). Elle hérite gratuitement des garanties déjà outillées du package : pureté vérifiée en CI (aucun `fetch`, aucune horloge), déterminisme testé, aucune dépendance base. Elle reçoit son propre contexte étroit (`HybridScoreContext` : séances réalisées de la fenêtre + référentiel des disciplines), **pas** le `PlanningContext` complet — le score n'a pas besoin de connaître l'objectif, les douleurs ni les restrictions médicales, et le lui donner créerait un couplage inutile.

### 4. Calibration : un état nominal, jamais une erreur

```
status = 'calibration'  si  weeks_available < calibration_min_weeks
                        ou  sessions_counted < min_sessions_for_score
```

`weeks_available` = nombre de semaines pleines écoulées depuis la première donnée réalisée de l'utilisateur (déclarée **ou** connectée, indifféremment — AC9).

En calibration, `score` vaut `null` : **aucun chiffre approximatif n'est produit, même en interne**. C'est la lecture littérale de l'AC8 et le prolongement du choix de la F1 (`ProgressDiagnosisResponse.status = 'calibration'` est une sortie nominale du moteur, pas une exception, ADR-006 §2). Les cartes volume et répartition restent servies : les données brutes sont fiables même quand l'agrégat ne l'est pas — c'est exactement ce que le design a prévu (§4.6).

**Réponse à la question ouverte §7 de la fiche** (« même seuil que la F1 ou seuil propre ? ») : **un paramètre propre, initialisé à la même valeur**. Partager le paramètre de la F1 lierait deux décisions produit distinctes — la fiabilité d'un diagnostic de stagnation et la représentativité d'un agrégat de charge — et interdirait d'en ajuster une sans bouger l'autre. Les initialiser à la même valeur préserve la cohérence de discours (« 4 semaines », déjà affiché par le bloc de calibration du Dashboard F1) sans figer le couplage.

### 5. Persistance : historique auditable, calcul paresseux

`hybrid_scores` conserve chaque calcul : score, composantes détaillées, fenêtre, `ruleset_version`, empreinte des entrées, répartition par discipline et par jour. Motifs : servir l'historique en courbe (question ouverte §7 de la fiche sur le format d'affichage), permettre l'explication (« basé sur 6 séances · 3 disciplines »), et rendre l'indicateur auditable comme le reste du produit.

Le calcul est **paresseux et idempotent** : `GET /api/v1/score/hybrid` recalcule si l'empreinte des entrées a changé depuis la dernière ligne, sinon relit. `unique (user_id, computed_for, inputs_digest)` interdit les doublons — même mécanisme que `plan_versions_idempotency` (ADR-005). Aucun cron dédié : le score d'un utilisateur inactif n'a aucune raison d'être recalculé chaque nuit, et il l'est de toute façon à sa prochaine lecture.

Recalcul déclenché aussi, sans attendre une lecture, après une saisie (`POST /session-logs`) et après un import (job de synchronisation) — c'est la lettre de l'AC7 (« recalculé à chaque nouvelle donnée pertinente »), et cela permet la zone live d'accessibilité prévue au design (« Score hybride mis à jour : 72 »).

### 6. Le score ne pilote rien

`computeHybridScore` n'est appelée par **aucune** étape du pipeline de génération de plan. Le score est un indicateur restitué à l'utilisateur ; il n'entre ni dans `computeWeeklyLoadTarget`, ni dans `applyHardGuardrails`, ni dans le diagnostic de stagnation. Sans cette frontière, une métrique d'affichage deviendrait un levier de charge non traçable — l'inverse exact de l'exigence d'auditabilité de la F1.

---

## Conséquences

**Positives**

- La formule est lisible en cinq lignes, explicable à l'utilisateur (« ta charge, ta régularité, ton équilibre entre disciplines »), et chaque composante est restituable séparément — ce que le design exploite déjà.
- Aucune valeur numérique n'est écrite dans le code : le fondateur ajuste les pondérations après usage réel, exactement comme les garde-fous de la F1.
- Un utilisateur 100 % déclaratif obtient le même score qu'un utilisateur connecté à volume égal : l'AC9 est structurelle, pas déclarative.
- Le score ne peut pas contredire une semaine de décharge prescrite par le coach.

**Négatives / à surveiller**

- **Un athlète mono-discipline plafonne à 80/100**, même parfait par ailleurs. C'est une conséquence assumée du positionnement (`D = 0`), déjà verbalisée par le design (« le score hybride prend tout son sens à partir de deux disciplines »), mais c'est une **décision produit visible** : elle est relayée au fondateur en question ouverte, et se corrige par une pondération (`weights.diversity = 0`) sans toucher au code.
- `chronic_load_reference_units` est une référence **unique pour tous les profils**. Un débutant plafonnera bas longtemps. Une référence par niveau d'expérience est possible plus tard : c'est un changement de ruleset, pas de schéma.
- Les facteurs d'intensité de `computeLoadUnits` (`packages/rules-engine/src/lib/load-units.ts`) deviennent, via le score, **visibles par l'utilisateur** alors qu'ils étaient jusqu'ici une clé de répartition interne. Une erreur de facteur ne se voyait pas ; elle se verra. C'est plutôt sain, mais cela justifie de les documenter dans `docs/rulesets/`.
- Le score dépend de `session_logs.load_units`, colonne **créée par cette feature** : sans elle, aucun score. La dette est traitée en ADR-015 §1.

---

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Somme brute des `load_units` sur 7 jours, affichée telle quelle | C'est déjà `S-volume-card`. Ce n'est pas un score : pas de borne, pas de comparabilité entre athlètes ni dans le temps, et aucune notion d'hybridité — l'AC7 demande explicitement autre chose qu'un total de volume. |
| Fenêtre de 7 jours pour le score (proposition citée en exemple par la fiche) | S'effondre pendant une semaine de décharge **imposée par l'AC8** : l'indicateur contredirait le coach. Retenu uniquement pour l'affichage du volume et du delta. |
| Ratio charge aiguë / charge chronique (ACWR) | Mesure un risque de blessure, pas une progression, et sa validité est contestée dans la littérature. Utiliser un indicateur de risque contesté sur un produit qui promet des garde-fous de sécurité serait un mélange dangereux des genres. |
| Score par discipline, puis moyenne | L'AC7 demande explicitement « un indicateur unique plutôt qu'une moyenne de métriques disparates ». Et une moyenne par discipline récompense la spécialisation, à rebours du produit. |
| Score incluant la récupération (sommeil, FC de repos) | Ces données restent déclaratives et facultatives (Strava ne les fournit pas, ADR-013). Une composante nulle pour la majorité des utilisateurs rendrait le score incomparable d'une personne à l'autre. À rouvrir si une source de récupération est intégrée. |
| Composante « taux de respect du plan » | Transforme le score en note de conduite et contredit l'esprit de l'AC6 (jamais de sanction sur inobservance). La régularité mesure le fait de s'entraîner, pas d'obéir. |
| Pondérations en dur dans `rules-engine` | Le fondateur ne pourrait plus ajuster sans déploiement, et un score de mars ne serait plus explicable avec la formule de mars (ADR-007 §1). |
| Paquet `@hybride/hybrid-score` séparé | Duplique les garanties de pureté, de déterminisme et l'outillage de test du moteur pour une fonction de 80 lignes qui consomme les mêmes `load_units`. |
| Recalcul nocturne de tous les scores par cron | Coût proportionnel à la base pour une valeur que seule une lecture rend utile. Le calcul paresseux donne le même résultat, toujours frais. |

---

## Questions ouvertes relayées au fondateur

> 1. ~~**Plafond à 80/100 pour un athlète mono-discipline**~~ **Tranché par le fondateur le 2026-08-12 : conservé tel quel.** Le plafond est assumé — cohérent avec le positionnement « Hybride », encourage la diversification sans pénaliser brutalement un mono-discipline. Pondérations `weights.volume=0.5 / weights.consistency=0.3 / weights.diversity=0.2` confirmées, pas de report de poids.
> 2. **Valeurs de référence** (`chronic_load_reference_units = 700`, `target_active_days_per_28d = 20`) : hypothèses d'ingénierie d'`architect`, à recalibrer sur les premières données réelles. Elles fixent de fait « à quoi ressemble un 100 » — c'est un choix éditorial autant que technique.
> 3. **Format d'affichage de l'historique** (courbe, décomposition) : le stockage le permet dès la V1 ; l'écran reste à concevoir (question ouverte §7 de la fiche, `designer`).
