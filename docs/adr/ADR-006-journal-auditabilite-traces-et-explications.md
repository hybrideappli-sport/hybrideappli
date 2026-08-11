# ADR-006 — Journal d'auditabilité : `decision_traces` (machine) séparé de `explanations` (humain)

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Décideur** : `architect`
- **Portée** : Projet
- **Dépend de** : ADR-002, ADR-005
- **Feature déclenchante** : US-01, contrainte d'auditabilité §5 — AC1, AC5, AC7

---

## Contexte

Trois exigences distinctes portent sur « l'explication », et elles sont souvent confondues :

1. **Auditabilité technique** (§5) : *toute décision de volume/charge/intensité doit pouvoir être tracée à une règle et à une donnée d'entrée précise*. Destinataires : le fondateur (revue qualité), le développeur (débogage), le régulateur potentiel.
2. **Explicabilité utilisateur** (AC1) : *une explication courte citant la donnée précise qui l'a justifiée — pas de justification générique*, plus un « en savoir plus » avec le raisonnement complet (AC5).
3. **Honnêteté épistémique** (AC7) : le coach doit savoir dire *« je suis en phase de calibration, je ne peux pas encore conclure »* plutôt que d'afficher une fausse assurance.

Ces trois besoins ont des cycles de vie, des volumétries, des niveaux de confidentialité et des producteurs différents. Les mêler dans une table unique aurait deux conséquences : soit l'audit devient dépendant du LLM (inacceptable), soit l'explication utilisateur devient illisible.

## Décision

**Deux tables, deux producteurs, une relation explicite.**

### 1. `decision_traces` — produit par le moteur à règles, jamais par le LLM

Une ligne = **une règle qui s'est déclenchée sur une cible**.

```
id, user_id, engine_run_id, plan_version_id, ruleset_version,
rule_id, rule_version, category, is_hard_guardrail,
scope, scope_ref_id,               -- ce qui est décidé (session, semaine, jour nutrition, objectif, zone douleur)
inputs_used jsonb,                 -- [{ source: 'session_logs', id, field: 'rpe', value: 9, observed_on: '2026-08-02' }, ...]
condition_expr text,               -- forme lisible de la condition évaluée
output jsonb,                      -- { field: 'load_units', before: 420, after: 360 }
severity, created_at
```

Points clés :

- `inputs_used` **référence les enregistrements sources par table et par id**, pas seulement des valeurs. C'est ce qui satisfait littéralement « tracée à une règle **et à une donnée d'entrée précise** » : depuis une trace, on remonte au log de séance exact qui a déclenché la baisse.
- Table **immuable** (pas de policy UPDATE/DELETE, trigger de blocage). Un plan supprimé ne supprime pas ses traces.
- `is_hard_guardrail = true` marque les bornes non contournables de l'AC8 : elles sont requêtables isolément (« combien de fois le plafond de progression a-t-il mordu ce mois-ci ? »), ce qui alimente la boucle d'amélioration continue du ruleset.
- Chaque valeur chiffrée d'un `PlanDraft` doit être couverte par au moins une trace : assertion en fin de run du moteur, sinon le run échoue.

### 2. `explanations` — produit par le rendu (template ou LLM)

Une ligne = **un texte affiché à l'utilisateur**, attaché à un sujet.

```
id, user_id, subject_type, subject_id,           -- planned_session | nutrition_day | plan_diff | plan_diff_item
                                                 -- | stagnation_diagnosis | objective_feasibility | pain_episode
short_text,                                       -- affichage par défaut (AC1)
long_text,                                        -- « en savoir plus » (AC5)
locale, generated_by ('template'|'llm'),
llm_model, llm_prompt_hash,
numeric_integrity_ok bool, fallback_used bool,
decision_trace_ids uuid[],                        -- ← le pont vers l'audit
confidence ('high'|'calibrating'|'unknown'),      -- ← AC7
created_at
```

Points clés :

- `decision_trace_ids` est **obligatoire et non vide**. Une explication sans trace est un texte non fondé : le contrôle est une contrainte `CHECK (array_length(decision_trace_ids, 1) >= 1)`.
- `generated_by`, `numeric_integrity_ok` et `fallback_used` rendent mesurable la qualité du rendu LLM en production (taux de repli, taux de rejet pour intégrité numérique) — indicateur de supervision à part entière.
- `confidence = 'calibrating'` est le mécanisme technique de l'**AC7** : le moteur produit une trace de type `calibration_insufficient_data` avec la fenêtre de données disponible, et le rendu affiche l'aveu d'ignorance. Ce n'est pas un cas d'erreur ni un état vide de l'UI, c'est une **sortie nominale du moteur**, ce qui garantit qu'on ne peut pas « oublier » l'AC7.

### 3. `engine_runs` — le contexte d'exécution

Une ligne par invocation du moteur : `trigger`, `ruleset_version`, `input_snapshot_hash`, `duration_ms`, `status`, `error`, `output_plan_version_id`. Permet de corréler un incident de production à un lot de plans, et de rejouer un run précis.

### 4. Chaîne complète d'audit

```
session_logs (RPE 9, douleur genou légère, 2026-08-02)
        │  référencé dans inputs_used
        ▼
decision_traces (rule: negative_signal.rpe_high, v3, ruleset 1.0.0)
        │  → output { load_units: 420 → 360 } sur planned_session #...
        ▼
plan_versions #7 (trigger: negative_signal)  ──► plan_diffs (items → decisionTraceIds)
        │
        ▼
explanations (short: « J'ai allégé ta sortie de jeudi : ton RPE de 9 sur la séance
              de dimanche et la gêne au genou signalée indiquent une fatigue en cours. »
              long: raisonnement complet)
```

## Conséquences

**Positives**

- L'audit ne dépend **pas** du LLM : si le fournisseur disparaît, les décisions restent intégralement explicables via `decision_traces` + rendu template.
- La revue qualité asynchrone du fondateur devient une vue back-office simple (plan + traces + garde-fous déclenchés), sans instrumentation supplémentaire.
- Réponse concrète au frein persona « est-ce que l'algo comprend vraiment ce que je fais ? » : le « en savoir plus » cite des données personnelles réelles et datées.
- L'AC7 est structurellement impossible à contourner (état nominal du moteur, pas cas limite d'UI).

**Négatives / à surveiller**

- Volumétrie : ~30 à 80 traces par génération de plan, soit un ordre de grandeur de 10 à 20 k lignes/utilisateur/an. Acceptable en Postgres avec index `(user_id, created_at)` et partitionnement à envisager au-delà de quelques milliers d'utilisateurs actifs.
- `inputs_used` contient des **données de santé** (RPE, douleur, sommeil) : la table entre dans le périmètre RGPD sensible, purge incluse (ADR-010).
- Discipline requise du `developer` : ajouter une règle au moteur sans émettre de trace doit être impossible — l'API du moteur impose de retourner la trace avec la décision (le type de retour est `{ value, trace }`, pas `value`).

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Table `explanations` unique (texte + justification technique) | Coupler l'audit au rendu ; une panne LLM ou un changement de style de texte détruirait la traçabilité. |
| Logs applicatifs (stdout / Datadog) comme journal d'audit | Non requêtable par utilisateur, rétention courte, non joignable aux données métier, non restituable à l'utilisateur. Insuffisant pour §5. |
| Reconstruire l'explication à la demande en rejouant le moteur | Ne restitue pas ce qui a été décidé *à l'époque* si le ruleset a évolué depuis — précisément le cas que l'audit doit couvrir. |
| Stocker seulement les valeurs d'entrée (sans référence aux lignes sources) | Ne permet pas de remonter à la saisie exacte de l'utilisateur ; la fiche exige « une donnée d'entrée précise ». |
