# ADR-004 — Modèle de données du plan multi-échelle (macro / méso / micro)

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet
- **Feature déclenchante** : US-01, AC1 / AC4 / AC13

---

## Contexte

L'AC1 impose trois échelles simultanées et **trois niveaux de détail différents** :

| Horizon | Échelle | Niveau de détail |
|---|---|---|
| J → J+7 | micro | séances complètes (contenu, durée, intensité, nutrition du jour) |
| J+8 → J+14 | micro | **intention** seulement (type de séance, charge indicative) |
| J+15 → date d'objectif | macro / méso | blocs typés (base / développement / spécifique / affûtage) |

Contraintes additionnelles :

- l'AC4 interdit toute notion de retard ou de rattrapage cumulatif : le plan est **reprojeté depuis la situation réelle du jour**, jamais dépilé comme une file d'attente ;
- l'AC13 fait de la granularité une **frontière de monétisation** : le jour seul en accès libre, la semaine complète et la vue macro réservées aux abonnés — la couche de données doit permettre de servir uniquement le jour sans charger la semaine ;
- l'AC5 exige un diff lisible entre deux versions (voir ADR-005) ;
- le réalisé (séances loguées) doit survivre à toutes les régénérations du prévu.

## Décision

**Modèle hybride : snapshot immuable + projection normalisée, avec séparation stricte prévu / réalisé.**

### 1. Deux univers disjoints

- **Le prévu** est *versionné et jetable* : il appartient à une `plan_version` et est remplacé à chaque régénération.
- **Le réalisé** (`session_logs`, `nutrition_checkins`, `body_metrics`) est *immuable et sans version* : il appartient à l'utilisateur et à une date, jamais à une version de plan. Un log référence `planned_session_id` de façon **nullable** — une séance non prévue reste enregistrable, et une séance loguée n'est jamais orpheline si son plan est régénéré.

C'est ce qui rend l'AC4 possible : régénérer le plan n'efface ni ne « rattrape » rien du passé.

### 2. Snapshot + projection

Chaque `plan_versions` porte :

- `snapshot jsonb` — le plan calculé **intégral** tel que sorti du moteur, jamais modifié. Sert au diff (ADR-005), au rejeu, à la revue qualité du fondateur, et à la restitution exacte de ce qui a été affiché à l'utilisateur ce jour-là.
- une **projection relationnelle** issue de ce snapshot, écrite dans la même transaction : `plan_blocks` (macro) → `plan_weeks` (méso/micro) → `planned_sessions` + `nutrition_days` (jour).

La projection existe parce que les requêtes du produit sont relationnelles : « la séance d'aujourd'hui », « les logs de la semaine joints à leurs séances prévues », « les 4 dernières semaines comparables » (AC6). Faire cela en parcourant du JSONB serait coûteux et fragile.

### 3. Matérialisation asymétrique selon l'horizon

`plan_weeks.detail_level ∈ {detailed, intent, macro}` et `planned_sessions.detail_level ∈ {detailed, intent}`.

- `detailed` : `prescription jsonb` complète (échauffement / corps de séance / retour au calme), `nutrition_days` associé complet.
- `intent` : `session_type`, `load_units`, `sport_id`, `duration_min` indicatif — **pas** de `prescription`, **pas** de `nutrition_days`.
- au-delà de J+14 : **aucune ligne `planned_sessions`**, seulement `plan_blocks` + `plan_weeks(detail_level = 'macro')` avec charge cible agrégée.

Bénéfice direct : le volume de lignes écrit à chaque régénération est borné (≈ 14 jours), et non proportionnel à la distance à l'objectif (qui peut être de 12 mois).

### 4. Unité de charge normalisée

`load_units` (entier) est l'unité de charge **inter-disciplines** du moteur, calculée par une fonction pure et documentée (durée × facteur d'intensité × facteur de discipline). Elle est indispensable à l'AC10 (répartition de la charge globale, et non par sport isolé) et à l'AC8 (plafond de progression hebdomadaire). Elle est stockée sur `plan_weeks` (cible) et `planned_sessions` (contribution), jamais recalculée à la volée à l'affichage.

### 5. Qui décide QUAND

Conformément au périmètre exclu de la fiche (Feature 3), `planned_sessions` porte `scheduled_date` + `slot ∈ {am, pm, unspecified}` — **la date, pas l'heure**. Le placement horaire fin, les créneaux et les imprévus appartiennent à la Feature 3, qui viendra enrichir la table sans la restructurer.

## Conséquences

**Positives**

- Le paywall de l'AC13 se traduit par une contrainte de requête simple et sûre : accès libre ⟹ `WHERE scheduled_date = current_date` ; abonné ⟹ semaine et blocs.
- Le diff (ADR-005) opère sur des snapshots complets, indépendamment de l'état courant de la projection.
- L'ajout de la Feature 2 (données connectées) se fait par de nouvelles lignes de réalisé (`source = 'connected'`), sans toucher au modèle du prévu — l'AC12 est structurellement respectée.
- Aucune duplication de vérité : le snapshot est la source, la projection en est dérivée dans la même transaction.

**Négatives / à surveiller**

- Redondance snapshot / projection : une divergence est possible si la projection est réécrite hors du chemin nominal. **Mitigation** : la projection n'est écrite que par une fonction unique `materializePlanVersion()`, aucune écriture directe autorisée, et un test de cohérence rejoue le snapshot et compare.
- Croissance de `plan_versions.snapshot` (régénérations fréquentes). **Mitigation** : politique de rétention à définir (conservation intégrale des 12 derniers mois, puis compaction hors des versions ayant servi à un diff affiché).
- Le passage `intent → detailed` d'une semaine doit être idempotent lors de la régénération hebdomadaire.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Tout en JSONB (une ligne par version) | Impossible de joindre efficacement prévu et réalisé, ni de calculer les fenêtres glissantes de l'AC6. Paywall difficile à garantir au niveau requête. |
| Tout normalisé, sans snapshot | Le diff de l'AC5 et le rejeu d'audit exigeraient une reconstruction historique complète ; toute évolution de schéma casserait l'auditabilité rétroactive. |
| Matérialiser toutes les séances jusqu'à l'objectif | Volume inutile (un objectif à 9 mois = ~250 séances réécrites à chaque régénération hebdomadaire), et contradictoire avec l'AC1 qui ne promet du détail que sur 7 jours. |
| Fusionner prévu et réalisé dans une table `sessions` unique | Rend impossible la régénération sans effet de bord sur l'historique, et donc l'AC4 (« ni retard ni rattrapage cumulatif »). |
