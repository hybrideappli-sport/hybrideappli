# ADR-005 — Versioning append-only du plan et diff hebdomadaire matérialisé

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet
- **Dépend de** : ADR-002, ADR-004
- **Feature déclenchante** : US-01, AC5 (diff explicable) — également AC4, AC6, AC9, AC14

---

## Contexte

Le plan est régénéré par **six déclencheurs différents**, pas seulement le dimanche soir :

| Déclencheur | Origine | AC |
|---|---|---|
| `onboarding` | validation du profil initial | AC1 |
| `objective_renegotiation` | acceptation d'un objectif ajusté | AC2 |
| `negative_signal` | RPE élevé / fraîcheur basse → baisse immédiate | AC4 |
| `pain_protocol` | douleur légère / persistante / aiguë | AC9 |
| `weekly_review` | dimanche soir | AC5 |
| `stagnation` | diagnostic sur 4 semaines glissantes | AC6 |
| `objective_end` | date cible atteinte | AC14 |

L'AC5 exige un diff lisible **de semaine à semaine**, alors que plusieurs versions intermédiaires ont pu être créées en cours de semaine par des signaux négatifs. Un diff naïf « version N-1 → version N » comparerait donc deux ajustements de mardi, pas deux semaines.

L'AC4 impose par ailleurs une asymétrie : les baisses sont immédiates, les hausses réservées à la révision hebdomadaire — cette règle doit être **vérifiable a posteriori**, donc portée par les données.

## Décision

### 1. `plan_versions` : append-only, immuable, numérotée

- `version_number` monotone croissant par `plan_id` (contrainte d'unicité `(plan_id, version_number)`).
- Aucune policy RLS `UPDATE`/`DELETE` : la table est en écriture seule par le service, en lecture seule pour son propriétaire. Un trigger `BEFORE UPDATE OR DELETE` lève une exception, y compris pour le rôle service.
- `plans.current_version_id` pointe la version active — **seul** ce pointeur bouge.
- Chaque version porte : `trigger`, `supersedes_version_id`, `ruleset_version`, `engine_run_id`, `input_snapshot jsonb`, `input_snapshot_hash`, `snapshot jsonb`, `horizon_start`, `horizon_end`.

### 2. Rejouabilité : `input_snapshot` + `input_snapshot_hash`

L'`input_snapshot` est le `PlanningContext` **complet** passé au moteur : profil, sports, objectif, historique de logs sur la fenêtre pertinente, épisodes de douleur actifs, date de référence, drapeaux de risque. Combiné à `ruleset_version`, il permet de rejouer exactement la génération.

`input_snapshot_hash` (SHA-256 canonicalisé) sert à deux choses :

- **détecter une dérive de moteur** : rejouer un hash connu et comparer la sortie ⟹ test de non-régression de production, automatisé en CI sur un corpus de contextes réels anonymisés ;
- **idempotence** : une régénération déclenchée deux fois avec le même contexte et le même ruleset ne crée pas de seconde version.

### 3. Repère hebdomadaire : `weekly_baseline_version_id`

Chaque `plan_versions` de trigger `weekly_review` marque le début d'une semaine de référence. Le diff de l'AC5 est **toujours** calculé entre :

```
version de référence de la semaine N-1  →  version de référence de la semaine N
```

Les versions intermédiaires (`negative_signal`, `pain_protocol`) restent visibles dans l'historique et alimentent le narratif du diff (« la charge de jeudi avait déjà été abaissée mercredi suite à ta douleur au genou ») mais **ne redéfinissent pas la ligne de base**. C'est ce qui rend le diff lisible pour l'utilisateur.

### 4. Diff matérialisé dans `plan_diffs`

Le diff est calculé par une **fonction pure** de `@hybride/rules-engine` :

```
diffPlanVersions(from: PlanSnapshot, to: PlanSnapshot): PlanDiff
```

puis **persisté** dans `plan_diffs` (items typés + explication associée), pour trois raisons :

1. **Stabilité** — le diff présenté dimanche soir ne doit pas se déformer si un nouvel ajustement survient lundi. Un diff recalculé à la volée dériverait.
2. **Auditabilité** — chaque item de diff référence les `decision_trace_ids` qui le justifient, ce qui alimente directement le lien « en savoir plus » de l'AC5 sans nouveau calcul ni nouvel appel LLM.
3. **Coût** — l'explication en langage naturel est générée **une fois**, à la création du diff, pas à chaque affichage.

Structure d'un item de diff :

```ts
type PlanDiffItem = {
  kind: 'session_added' | 'session_removed' | 'session_modified'
      | 'week_load_changed' | 'block_changed' | 'nutrition_target_changed'
      | 'deload_inserted' | 'zone_paused';
  scope: 'week' | 'day' | 'block';
  targetDate?: string;              // ISO date
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  direction: 'increase' | 'decrease' | 'neutral';
  decisionTraceIds: string[];       // → auditabilité (ADR-006)
  explanationId: string | null;     // court + long
};
```

### 5. Invariant d'asymétrie vérifié par les données

Un item de diff avec `direction = 'increase'` **ne peut exister** que sur une version de trigger `weekly_review` ou `objective_renegotiation`. C'est :

- une assertion en sortie de moteur (le run échoue si violée),
- une contrainte de test (property-based, cf. plan §4),
- et une requête d'audit exécutable à tout moment sur la production.

L'AC4 devient ainsi une propriété observable, pas une intention.

## Conséquences

**Positives**

- Traçabilité complète : pour toute séance affichée un jour donné, on sait quelle version l'a produite, quel ruleset, quelles entrées, quelles règles.
- La revue qualité asynchrone du fondateur (§4 de la fiche) s'appuie sur des artefacts déjà présents : `plan_versions.snapshot` + `decision_traces` + `plan_diffs`.
- Le lien « en savoir plus » est une lecture, pas un calcul : aucune latence LLM à l'affichage.
- Un changement de ruleset ne réécrit jamais l'historique : les anciens plans restent explicables avec les règles qui les ont produits.

**Négatives / à surveiller**

- Volume : `plan_versions` croît à chaque signal négatif. Estimation ≈ 2 à 5 versions/semaine/utilisateur, soit ~250/an — parfaitement soutenable, mais la rétention du `snapshot` doit être planifiée (ADR-004).
- La notion de « version de référence hebdomadaire » ajoute un concept à expliquer au `developer` : elle est portée explicitement par la colonne `is_weekly_baseline` pour éviter toute reconstruction implicite.
- Le premier diff (semaine 1) n'a pas de version de référence précédente : cas à traiter explicitement en UI (« première semaine, rien à comparer »), à ne pas laisser en erreur.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Mutation en place du plan + table d'audit `plan_changes` | Impossible de restituer ce que l'utilisateur a réellement vu à une date passée ; l'audit devient une reconstruction, donc contestable. |
| Diff calculé à la volée à chaque affichage | Diff instable dans le temps, coût LLM répété, et rupture du lien avec les traces de décision de l'instant du calcul. |
| Diff « version N-1 → version N » sans notion de baseline | Produit un diff illisible pour l'utilisateur (compare deux micro-ajustements) et ne répond pas à l'AC5 qui parle explicitement de « la semaine précédente ». |
| Event sourcing complet (log d'événements, plan reconstruit par projection) | Puissant mais surdimensionné à ce stade ; le couple snapshot immuable + traces couvre déjà les besoins d'audit sans le coût conceptuel. |
