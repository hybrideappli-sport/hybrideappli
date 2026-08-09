# ADR-007 — Paramètres de sécurité versionnés en base (`rulesets`) plutôt qu'en dur

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet
- **Dépend de** : ADR-002, ADR-005
- **Feature déclenchante** : US-01, AC8 — et question ouverte n°2 de la fiche

---

## Contexte

L'AC8 impose quatre bornes dures :

- plafond de progression hebdomadaire de charge/volume,
- plafond de séances intenses par semaine,
- semaine de décharge obligatoire tous les **N** blocs (non désactivable en V1),
- nombre maximum de jours consécutifs sans repos.

**Les valeurs numériques ne sont pas définies.** La fiche les liste explicitement comme question ouverte :

> Quel est le nombre exact N de blocs entre deux semaines de décharge obligatoire, et les valeurs précises des plafonds […] ? (paramètres à trancher avant `architect`/implémentation, priorité sécurité).

Or ces paramètres sont exactement ce qui devra bouger le plus dans les six premiers mois, à mesure que la revue qualité du fondateur remonte des anomalies et que la littérature est consolidée. Les figer dans le code impose un cycle deploy complet pour chaque ajustement, et — plus grave — rend impossible d'expliquer *avec quelles bornes* un plan de mars a été produit.

## Décision

Les paramètres du moteur vivent dans une table `rulesets`, **versionnée sémantiquement et immuable**.

```sql
rulesets (
  version text PRIMARY KEY,        -- '1.0.0'
  params jsonb NOT NULL,           -- l'intégralité des seuils
  source_refs jsonb NOT NULL,      -- références documentaires par paramètre
  checksum text NOT NULL,
  published_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  notes text
)
```

### 1. Immuable et référencée

Une version publiée n'est jamais modifiée : un ajustement de seuil **crée une nouvelle version**. Chaque `engine_runs`, `plan_versions` et `decision_traces` porte `ruleset_version`. Un plan de mars reste donc explicable avec les bornes de mars, même si celles de juillet diffèrent (exigence directe de l'ADR-005 §« un changement de ruleset ne réécrit jamais l'historique »).

### 2. `source_refs` : la traçabilité documentaire du moteur autonome

La fiche impose un moteur **autonome**, construit sur la littérature sportive et non sur l'expertise personnelle du fondateur (§1). `source_refs` associe chaque paramètre à sa justification documentaire :

```json
{
  "weekly_volume_progression_cap_pct": {
    "value_ref": "params.guardrails.weekly_volume_progression_cap_pct",
    "sources": ["<référence à compléter>"],
    "confidence": "to_validate",
    "last_reviewed": "2026-08-04"
  }
}
```

C'est le support technique de la question ouverte n°1 de la fiche (« quelles sources documentaires, et qui en assure la maintenance ? ») et de l'argument produit « auditabilité des règles » qui remplace l'argument interdit « conçu par un vrai coach ».

### 3. Le schéma des paramètres est typé et validé

`params` est validé par un schéma Zod (`RulesetParamsSchema`) dans `@hybride/domain`. Une version non conforme ne peut pas être activée. Le moteur reçoit le ruleset **en argument** (`generatePlan(context, ruleset)`) et ne le lit jamais depuis la base — la pureté de l'ADR-002 est préservée.

### 4. Structure de `params` (V1)

```jsonc
{
  "guardrails": {
    "weekly_volume_progression_cap_pct": null,   // AC8 — À TRANCHER
    "weekly_load_progression_cap_pct":   null,   // AC8 — À TRANCHER
    "max_intense_sessions_per_week":     null,   // AC8 — À TRANCHER
    "deload_every_n_blocks":             null,   // AC8 — À TRANCHER (N)
    "deload_volume_reduction_pct":       null,
    "max_consecutive_days_without_rest": null,   // AC8 — À TRANCHER
    "cold_start_volume_ratio":           null    // AC1 — volume de démarrage < volume déclaré
  },
  "interference": {                              // AC10
    "min_hours_between_intense_and_strength_same_groups": null,
    "global_load_distribution_strategy": "by_priority"
  },
  "pain_protocol": {                             // AC9
    "persistent_signal_threshold": null,         // nb de séances consécutives, même zone
    "persistent_window_days": null
  },
  "stagnation": {                                // AC6 / AC7
    "calibration_min_weeks": 4,                  // fixé par AC6/AC7
    "rolling_window_weeks": 4,                   // fixé par AC6
    "nonadherence_completion_rate_threshold": null,
    "overload_rpe_trend_threshold": null
  },
  "nutrition": {                                 // AC11
    "max_daily_deficit_pct": null,               // « jamais de déficit agressif »
    "absolute_kcal_floor_male": null,            // plancher de sécurité explicite
    "absolute_kcal_floor_female": null,
    "protein_g_per_kg_range": [null, null],
    "carb_modulation_by_session_type": { "rest": null, "endurance": null, "intensity": null }
  },
  "free_access": {                               // AC13 — voir ADR-008
    "accesses_per_period": 3,
    "window_strategy": "fixed_week"
  }
}
```

Les `null` sont **volontaires et bloquants** : le schéma Zod refuse une version publiée contenant un `null` sur un paramètre de garde-fou. Le produit ne peut donc pas partir en production avec des seuils implicites choisis par un développeur.

### 5. Cache et activation

Une seule version `is_active = true` à la fois (index unique partiel). Le ruleset actif est chargé en cache mémoire côté API avec invalidation sur changement de version, jamais lu par le moteur lui-même.

## Conséquences

**Positives**

- La question ouverte n°2 de la fiche cesse d'être bloquante pour l'architecture et l'implémentation : le `developer` peut construire tout le moteur, la CI et les tests avec un ruleset de développement documenté, et le fondateur tranche les valeurs avant publication de la V1.
- Ajuster un seuil après une anomalie de revue qualité = une insertion de ligne + activation, sans déploiement, avec effet daté et traçable.
- Comparer deux versions de règles sur un corpus de contextes réels (A/B de sécurité hors ligne) devient possible.

**Négatives / à surveiller**

- Un paramètre en base est un **levier de sécurité modifiable sans passer par la revue de code**. Contre-mesure : accès en écriture réservé au `service_role`, publication via une migration ou une procédure d'admin tracée (`published_by`, `notes`), et alerte sur tout changement de `guardrails`.
- Tentation d'y déplacer de la logique (pas seulement des valeurs). Règle : `params` contient des **scalaires et des plages**, jamais des expressions ou du code. Toute logique reste dans `rules-engine`, revue et testée.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Constantes TypeScript dans `rules-engine` | Un ajustement de sécurité exige un déploiement ; et un plan ancien ne serait plus explicable avec les bornes de son époque (perte d'auditabilité rétroactive). |
| Variables d'environnement Vercel | Non versionnées, non typées, non documentées, non joignables à un plan. Le pire des deux mondes. |
| Feature flags (LaunchDarkly, etc.) | Outil de rollout, pas de référentiel de paramètres métier auditables ; pas d'historique exploitable en jointure. |
| Attendre que le fondateur tranche avant de commencer | Bloque l'implémentation entière sur une question de contenu, alors que l'architecture peut l'absorber proprement. |

## Question ouverte relayée au fondateur

> Les 7 paramètres marqués `À TRANCHER` doivent être renseignés et sourcés **avant la publication du ruleset 1.0.0 en production**. Tant qu'ils sont `null`, seul un ruleset `0.x.y` de développement peut être activé, et l'environnement de production refuse le démarrage.

**Mise à jour 2026-08-06** : les 6 paramètres de `guardrails` (AC8) ont une proposition sourcée dans `docs/rulesets/0.1.0-dev.md`, statut `to_validate`. Restent `null` et non traités par cette note : `interference.min_hours_between_intense_and_strength_same_groups` (AC10), `pain_protocol.*` (AC9), `stagnation.*` (AC6/AC7), `nutrition.*` (AC11), `cold_start_volume_ratio` (AC1).
