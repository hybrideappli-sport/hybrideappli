# ADR-019 — Recueil post-séance conversationnel : le coach relance, le formulaire reste en secours

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Décideur** : `architect`, sur quatre arbitrages du fondateur du 2026-09-25
- **Portée** : Feature — recueil des signaux post-séance. **Première étape seulement** : ni l'onboarding, ni la tab bar, ni le planning ne sont touchés.
- **Dépend de** : ADR-002 (séparation moteur / LLM — le LLM ne calcule jamais), ADR-010 §3 (données de santé, rétention), ADR-011 (file de jobs, triple canal de notification)
- **Amendement du 2026-09-26** : le point ⛔ de validation du prompt est **décalé après L3**, et rien d'US-05 ne part en production avant lui. Le cas hors plan est **retiré** du Lot L2. Voir **§ Amendement du 2026-09-26** en fin de document.
- **Ne touche pas** : ADR-007 (aucun paramètre de sécurité nouveau), ADR-016, ADR-017 — le débrief écrit du **réalisé**, jamais du plan

---

## Contexte

Le moteur attend six signaux après une séance : `completion` et `pain` (obligatoires), `painZone` dès que la douleur n'est pas `none`, puis `rpe` et `freshness`, facultatifs au schéma mais **décisifs à l'usage**. Trois d'entre eux déclenchent une baisse immédiate de 20 % de la charge de la semaine courante (`06-compute-weekly-load-target.ts` l.202) :

```
rpe >= 8  ||  freshness <= 2  ||  pain !== "none"
```

Le constat qui motive ce chantier tient en une phrase : **aujourd'hui, ne rien saisir équivaut à dire que tout va bien.**

Quand l'utilisateur ne remplit pas le formulaire, aucune ligne `session_logs` n'est créée. `hasActiveNegativeSignal()` ne trouve rien, donc aucune baisse — et surtout **aucun blocage de hausse** : la progression continue comme si la séance s'était bien passée. Le seul `not_done` automatique vient de `closeOutScheduleIncidents()`, et il ne concerne que les **imprévus signalés**, jamais une séance simplement oubliée.

Le silence est donc interprété comme un feu vert, chez un utilisateur qui décroche précisément parce que quelque chose ne va pas.

Un formulaire vide reste vide. Une conversation peut relancer.

---

## Décision

### 1. Le coach relance, et la conversation remplace le formulaire sur un seul cas

La conversation devient le chemin par défaut du **débrief de la séance planifiée du jour**. Elle ne remplace pas `DailyLogForm`, qui est un composant à quatre modes rendu à six endroits — voir §Conséquences.

### 2. Une conversation par séance, liée à `planned_session_id`

Deux séances le même jour sont deux efforts distincts, avec deux ressentis. Les fusionner ferait perdre la granularité que le moteur attend : `rpe` et `freshness` qualifient **une** séance, pas une journée.

Conséquence assumée : deux relances possibles le même soir. Elles sont **groupées à l'envoi** — un message « deux séances à débriefer », N fils distincts derrière.

### 3. Écriture précoce, dès que `completion` + `pain` sont obtenus

C'est la décision centrale, et la seule qui ferme réellement le trou décrit en Contexte.

```
completion + pain (+ painZone)  obtenus  ⟹  POST /session-logs
rpe / freshness                 ensuite  ⟹  PATCH /session-logs/:id
```

Une conversation interrompue laisse donc **un log valide**, pas rien. Si `pain ≠ none` a déjà été dit, la baisse de 20 % se déclenche même si l'utilisateur ne revient jamais.

L'alternative — tout écrire à la fin — est plus simple et reconduit exactement le défaut qu'on corrige.

`UpdateSessionLogInputSchema` accepte déjà `rpe` et `freshness` en optionnel : l'enrichissement ne demande aucune extension de contrat.

### 4. Tables dédiées `debrief_sessions` / `debrief_messages`

Plutôt que d'élargir `onboarding_sessions` / `onboarding_messages`.

Ces tables portent `onboarding_step` et une sémantique de construction de profil qui ne s'applique pas. Surtout, **ADR-010 §3 traite `contains_health_data` message par message** : un débrief parle systématiquement de douleur, donc porte systématiquement de la donnée de santé, là où un message d'onboarding n'en porte qu'occasionnellement. Mélanger les deux rendrait la rétention plus difficile à raisonner — et la rétention des données de santé n'est pas un sujet où l'on gagne à être approximatif.

### 5. Le prompt énumère les valeurs permises

Le modèle ne produit une valeur d'énumération qu'en la **recopiant** d'une liste fournie : les 3 `completion`, les 3 `pain`, **les 14 zones corporelles**, et les bornes 1-10 et 1-5.

Cette règle n'est pas théorique. Sans elle, l'onboarding produisait `course_a_pied` là où `running` existait au référentiel (corrigé le 2026-09-18), avec pour conséquence des plans calculés sur la mauvaise famille de sport. Le même mécanisme appliqué à `painZone` donnerait `genou_droit` au lieu de `knee` — et un protocole douleur qui ne se déclenche jamais.

Toute extraction hors énumération est **écartée**, et le tour requalifié en reformulation — patron de `runOnboardingTurn()`.

### 6. `rpe` et `freshness` : une seule insistance

Demandés **ensemble, en un tour**. S'ils ne viennent pas, on clôt : le log est déjà écrit, rien n'est perdu.

Le langage naturel est accepté mais jamais deviné : en cas de doute, chips fermées plutôt qu'une valeur inventée. Après deux incompréhensions sur la même question, bascule en question fermée — `MAX_REFORMULATIONS_BEFORE_CLOSED_QUESTION`, règle produit de `04-flow.md` déjà implémentée.

On n'explique pas l'enjeu à l'utilisateur. Lui dire « sans ça je ne peux pas baisser ta charge » transforme une question en formulaire à justification.

### 7. Relance à 20 h locale, granularité quotidienne

Le plan Vercel **Hobby** plafonne chaque cron à une exécution par jour (arbitrage du 2026-08-19, ADR-011 mis à jour). Une relance « 2 h après la séance » est donc hors d'atteinte, et le plan n'est pas rouvert pour ça.

Deux chemins complémentaires :

- **en app** — à l'ouverture de `/aujourdhui` après l'heure de fin de séance, sans log existant, le coach ouvre la conversation. Coût nul, latence nulle ;
- **filet** — job `session_debrief` enrôlé à 20 h locale par le cron quotidien, sur le patron de `enqueue-schedule-closeouts`. Notification via `notifyUser()`, dont la ligne `in_app` est la seule garantie dure.

### 8. La branche paywall bloqué garde le formulaire

`dashboard/page.tsx` l.120 sert l'utilisateur dont le quota est épuisé. **AC13 garantit que la saisie quotidienne reste accessible** et ne consomme jamais d'accès libre. Y placer une conversation LLM créerait un coût là où le produit s'engage à la gratuité.

---

## Mesure — la condition de l'évaluation

`docs/mesures/recueil-post-seance.sql` établit la référence **avant** bascule, sur 90 jours glissants :

| Taux | Ce qu'il dit |
|---|---|
| `pct_saisie` | une séance passée a-t-elle laissé une trace ? C'est le trou visé |
| `pct_avec_rpe` | un log sans eux est valide mais **inerte** — il n'ajustera jamais rien |
| `pct_avec_freshness` | idem |
| **`pct_signal_negatif`** | **le juge** — à quelle fréquence le recueil déplace réellement le plan |

Les trois premiers mesurent du remplissage. Le quatrième mesure un effet. **Si la saisie monte sans que `pct_signal_negatif` bouge, le chantier aura fait du bruit.**

---

## Découpage en lots

> Convention du dépôt, telle qu'employée en ADR-018 et reprise en en-tête de chaque migration.

| Lot | Contenu | Livrable vérifiable | Dépendances |
|---|---|---|---|
| **L0 — Référence** | Exécution de `docs/mesures/recueil-post-seance.sql` sur `hybrideclub` | Quatre taux consignés avec leur date | **Fondateur** (accès prod) |
| **L1 — Socle conversation** | Migration `debrief_sessions` / `debrief_messages` (RLS `own`, `contains_health_data`, unicité sur `planned_session_id`) ; `DebriefDraftPatchSchema` ; `runDebriefTurn()` ; prompt à énumérations ; mock déterministe ; `POST /api/v1/debrief/:plannedSessionId/messages` | ① une conversation complète produit un brouillon conforme ; ② une extraction hors énumération est **écartée** et le tour requalifié ; ③ **aucune écriture dans `session_logs`** ; ④ deux conversations pour la même séance impossibles | — |
| **⛔** | **Validation humaine** — qualité du prompt sur le vrai Mistral, pas le mock. Rien n'est encore écrit en base métier : c'est le moment prévu pour se tromper sans coût. | | |
| **L2 — Écriture précoce et signaux** | Trio ⟹ `POST /session-logs` ; `rpe`/`freshness` ⟹ `PATCH` ; branchement sur `runSessionLogSignalPipeline()` ; idempotence de reprise ~~; cas hors plan~~ — retiré le 2026-09-26, voir fin de document | ① conversation interrompue après le trio ⟹ log valide ; ② `rpe = 9` ⟹ trace `progression.negative_signal_reduction`, charge −20 % ; ③ reprise ⟹ `PATCH`, jamais un second log ; ④ `pain ≠ none` sans zone refusé par Zod **et** par `pain_zone_required` | L1 |
| **L3 — Écran et repli** | UI de chat sur `/aujourdhui` ; questions fermées après 2 reformulations ; une seule relance `rpe`/`freshness` ; repli explicite vers `DailyLogForm` | ① e2e conversation → log → plan ajusté ; ② LLM en échec ⟹ formulaire, saisie possible ; ③ 2 incompréhensions ⟹ chips ; ④ paywall bloqué : formulaire, **aucun appel LLM** | L2 |
| **L4 — Relance automatique** | Job `session_debrief` à 20 h locale ; **groupage à l'envoi** ; ouverture spontanée sur `/aujourdhui` | ① deux séances ⟹ **une** notification, **deux** conversations ; ② séance déjà loggée ⟹ aucune relance ; ③ badge `in_app` même si Push et Brevo échouent ; ④ aucun doublon sur deux passages | L3 |
| **⛔** | **Validation humaine** — rejouer L0 et comparer. `pct_signal_negatif` décide si le formulaire reste le chemin par défaut. | | |

**Ordre** : L0 → L1 → ⛔ → L2 → L3 → L4 → ⛔.

**L1 et L2 n'ont pas d'UI** et se démontrent par tests d'intégration, comme les lots L1/L2 de la Carte. **L4 est séparable** : avec L3 livré, un utilisateur qui ouvre l'app a déjà la conversation ; L4 n'ajoute que la relance de ceux qui ne l'ouvrent pas.

---

## Conséquences

**Le formulaire reste, et ce n'est pas une dette.** `DailyLogForm` est un composant à quatre modes rendu à six endroits : correction d'un log passé, séance hors plan, séance planifiée, branche paywall bloqué. La conversation ne remplace que le quatrième cas. Le reste garde le formulaire, qui sert aussi de **repli quand le provider LLM échoue** — le projet a déjà ce patron (`weekly-review-llm-failure.test.ts`).

**Aucun travail `designer` n'est nécessaire.** La charte §4.10 définit les bulles de chat, et les composants existent : `chat-bubble.tsx`, `coach-typing-indicator.tsx`, `answer-input.tsx`, `coach-chat.tsx`. L3 est de l'assemblage.

**Coût LLM nouveau, proportionnel aux séances.** Chaque débrief consomme plusieurs tours. Il ne consomme en revanche **aucun accès libre** — `POST /session-logs` n'a jamais été derrière le quota, et la conversation n'y change rien.

**L'invariant « douleur ⟹ zone » est doublé.** Il vit dans le `superRefine` de `CreateSessionLogInputSchema` **et** dans la contrainte SQL `pain_zone_required`. Une conversation qui produirait une douleur sans zone serait rejetée par Postgres même si la validation applicative laissait passer.

---

## Alternatives écartées

| Alternative | Pourquoi écartée |
|---|---|
| **Écrire le log à la fin de la conversation** | Plus simple, mais reconduit exactement le défaut corrigé : une conversation abandonnée ne laisse rien, comme un formulaire vide. |
| **Élargir `onboarding_sessions` / `onboarding_messages`** | Économise une migration, mais mêle deux sémantiques et brouille la rétention des données de santé (ADR-010 §3), qu'un débrief porte systématiquement. |
| **Une conversation par jour** | Perd la granularité par séance que `rpe` et `freshness` supposent. Deux efforts distincts, deux ressentis. |
| **Supprimer `DailyLogForm`** | Six points de rendu, quatre modes, dont la branche paywall bloqué où AC13 promet un accès gratuit, et le repli sur échec LLM. |
| **Passer Vercel Pro pour une relance à l'heure** | Rouvre un arbitrage de coût tranché le 2026-08-19 pour un gain de précision, alors que le chemin en app couvre déjà l'utilisateur actif. |
| **Expliquer l'enjeu à l'utilisateur** (« sans `rpe` je ne peux pas adapter ») | Transforme une question en formulaire à justification, et déplace sur l'utilisateur la charge d'un mécanisme interne. |

---

## Questions ouvertes relayées

1. **Que fait le coach d'une séance jamais débriefée, même après relance ?** Aujourd'hui : rien, et la charge monte. Faut-il un `not_done` automatique après N jours, comme `closeOutScheduleIncidents()` le fait pour les imprévus ? Ce serait un **ajustement de charge déclenché par le temps**, ce que l'ADR-017 a explicitement refusé pour la clôture d'imprévu. À arbitrer séparément.
2. **Seuils `rpe >= 8` et `freshness <= 2` en dur.** Ils vivent dans `guardrail-helpers.ts` l.23 **et** dans `run-session-log-signal-pipeline.ts` l.27 — dupliqués, non versionnés, contrairement aux bornes de sécurité d'ADR-007. Hors périmètre ici, mais le chantier les rend plus visibles.

---

## Amendement du 2026-09-26 — le point ⛔ de validation du prompt est décalé

> **Décision du fondateur, 2026-09-26.** L2 et L3 avancent sur le mock déterministe. La validation du prompt sur le vrai modèle, prévue entre L1 et L2, est reportée. En contrepartie, **aucun lot d'US-05 ne part en production avant qu'elle ait eu lieu.**

### Pourquoi

Le point ⛔ supposait un accès au vrai Mistral. Il n'y en a pas aujourd'hui :

- le compte Mistral est sur le plan Free, dont la clé renvoie `429` à chaque appel, y compris au premier, et sur 8 minutes de relances espacées ;
- **la production n'a pas de `MISTRAL_API_KEY`** : les variables d'environnement de `hybrideappli-web` n'en contiennent aucune (constat du 2026-09-26). Le vrai modèle n'est donc joignable nulle part.

Payer l'abonnement pour la seule validation n'a pas été retenu, et aucune alternative ne valide le **même** modèle. Un Ollama local ne tient qu'un modèle d'environ 7B sur la machine de développement, et un autre fournisseur rouvrirait l'ADR-010. Attendre bloquerait L2 et L3, dont la mécanique ne dépend pas de la qualité du prompt.

### Le risque assumé

Ce que le mock ne dit pas, c'est **si le vrai modèle remplit le brouillon correctement**. Les tests de L2 et L3 prouvent que la mécanique est juste **pour des extractions correctes**. Ils ne disent rien du taux d'extractions correctes en conditions réelles.

Le point ⛔ était placé avant L2 parce que L2 **écrit dans `session_logs`** : à partir de là, une erreur de prompt ne coûte plus une conversation ratée, elle produit du réalisé faux. Or ce réalisé déclenche la baisse de charge de 20 % (`rpe`, `freshness`, douleur) et le protocole douleur. Un `pain` manqué laisse monter la charge d'un athlète blessé ; un `rpe` sur-extrait baisse sans raison le plan d'un athlète en forme.

Les défenses qui restent actives sans le vrai modèle :

- toute valeur hors énumération (zone, discipline, type de séance) rejette le patch entier (§5, et `c9b41b9` pour `sportCode` / `sessionType`) ;
- `pain ≠ none` sans zone est refusé deux fois, par Zod et par la contrainte SQL `pain_zone_required` ;
- rien ne protège en revanche contre une valeur **permise mais fausse** : `pain = none` quand l'utilisateur a parlé d'une gêne, `rpe = 9` quand il a dit « tranquille ». C'est précisément ce que la validation devait juger, et c'est le risque qui reste ouvert.

### La condition : rien en production avant la validation

Concrètement, jusqu'à la validation :

1. **Aucune branche d'US-05 n'est fusionnée dans `main`**, qui déploie en production. Les lots s'empilent : L2 part de la branche L1, L3 de la branche L2.
2. **Aucune migration d'US-05 n'est appliquée sur `hybrideclub`**, à commencer par `0030_debrief_sessions`.
3. Les déploiements *Preview* de Vercel partagent les variables Supabase de production (« Production and Preview »). Un aperçu de ces branches parle donc à la base de production. Sans la migration `0030`, il échoue sur les routes de débrief sans rien écrire, mais **il ne doit pas servir à tester le débrief**. Le problème dépasse US-05 : il est consigné comme dette générale, `08-architecture.md` §12, item 23.

### Ce qui lèvera la condition

Une clé Mistral opérationnelle, qui est de toute façon nécessaire à la production : sans elle, `getLlmProvider()` refuse de démarrer, ce qui casse l'onboarding, la régénération du plan et la revue hebdomadaire. Le banc de huit scénarios écrit le 2026-09-26 (nominal, zone latéralisée, séance partielle, non faite, réponses floues, refus de `rpe`/`freshness`, hors plan, sport absent du référentiel) se relance alors en une commande. **Le point ⛔ garde le même contenu, seule sa place change : il doit être franchi avant la première fusion d'US-05 dans `main`.**

**Ordre révisé** : L0 → L1 → L2 → L3 → ⛔ validation du prompt → fusion dans `main` → L4 → ⛔ mesure.

### Le cas hors plan est retiré du Lot L2

> **Décision du fondateur, 2026-09-26.** Une séance hors plan reste saisie par le formulaire, comme la correction d'un log passé et la branche paywall bloqué.

Le découpage l'attribuait à L2, mais le reste de l'ADR ne le permet pas : §1 limite la conversation à la **séance planifiée du jour**, et `debrief_sessions.planned_session_id` est `not null unique` (§2, migration `0030`). Une conversation hors plan n'aurait aucune ligne où vivre sans rouvrir le schéma.

Cela confirme le partage décrit en §Conséquences : la conversation remplace **un seul** des modes de `DailyLogForm`, et le formulaire garde les trois autres. `missingOffPlan()` et `DebriefTurnInput.session.isOffPlan` restent dans le code, sans appelant qui les active. Ils coûtent peu et n'engagent rien.

