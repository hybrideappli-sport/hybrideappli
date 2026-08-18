# Architecture technique — Hybride Club

> Phase Plan du cycle Ottho. Rédigé par `architect` le 2026-08-04. **Révisé le 2026-08-07** (arbitrage post-revue du Lot L1 — voir §5 et §12). **Mise à jour doc de fin de projet le 2026-08-11** par `doc-writer` (§5.3, §6.8, §12 — état réel post-revue de fin de projet et contre-revue, `reviews/US-01-coach-ia-personnalise-review*.md`). **Étendu le 2026-08-12** par `architect` pour l'US-02 — centralisation des données et score hybride (§11 réécrite, **§13 ajoutée**, §12 complétée ; ADR-013, ADR-014, ADR-015). **Étendu le 2026-08-12** par `architect` pour l'US-03 — planning selon emploi du temps (**§14 ajoutée**, §3.2, §4.1, §6, §6.8, §7, §11, §12 complétées ; ADR-016, ADR-017).
> Document projet, source de vérité technique. Lecture seule pour `developer`, `tester`, `doc-writer`.
>
> Entrées : `07-spec-feature1-coach-ia.md` (fonctionnel, fait foi), `09-spec-feature2-centralisation-donnees.md` (fonctionnel US-02, fait foi), `09-design-feature2-notes.md`, `10-spec-feature3-planning-emploi-du-temps.md` (fonctionnel US-03, fait foi), `10-design-feature3-notes.md`, `05-zoning-pencil.md`, `04-flow.md`, `03-mvp.md`, `02-persona.md`, `06-recap.md`, `backlog.md`, maquettes hi-fi Pencil.
> Décisions détaillées : `/docs/adr/`.
> **DDL canonique : `/docs/db-schema.md`** (extrait de ce document le 2026-08-07 — voir §5 ; deltas US-02 en §10 et US-03 en §11 de ce fichier).
> Plans d'implémentation : `/plans/US-01-coach-ia-personnalise.md`, `/plans/US-02-centralisation-donnees.md`, `/plans/US-03-planning-emploi-du-temps.md`.

---

## Sommaire

1. [Périmètre et hypothèses](#1-périmètre-et-hypothèses)
2. [Stack technique](#2-stack-technique)
3. [Architecture logicielle](#3-architecture-logicielle)
4. [Le moteur à règles](#4-le-moteur-à-règles)
5. [Schéma de base de données](#5-schéma-de-base-de-données)
6. [Contrats d'API](#6-contrats-dapi)
7. [Traitements périodiques et notifications](#7-traitements-périodiques-et-notifications)
8. [Sécurité, RGPD, RLS](#8-sécurité-rgpd-rls)
9. [Environnements et déploiement](#9-environnements-et-déploiement)
10. [Couverture des 14 critères d'acceptation](#10-couverture-des-14-critères-dacceptation)
11. [Anticipation Features 2 et 3](#11-anticipation-features-2-et-3)
12. [Hypothèses et questions ouvertes](#12-hypothèses-et-questions-ouvertes)
13. [Feature 2 — centralisation des données et score hybride](#13-feature-2--centralisation-des-données-et-score-hybride)
14. [Feature 3 — planning selon emploi du temps](#14-feature-3--planning-selon-emploi-du-temps)

---

## 1. Périmètre et hypothèses

Ce document définit la **fondation technique complète du produit**, à l'occasion de sa première feature. Il n'existait aucune stack, aucun schéma, aucun code avant lui.

Trois contraintes produit structurent tout le reste, et sont traitées comme non négociables :

| Contrainte (source) | Traduction technique |
|---|---|
| Le LLM n'a jamais autorité sur le contenu chiffré du plan (fiche §5) | Isolation physique du moteur à règles, contrôle d'intégrité numérique sur les textes LLM — ADR-002, ADR-003 |
| Toute décision de volume/charge doit être traçable à une règle et une donnée d'entrée précise (fiche §5) | `decision_traces` + `engine_runs` + snapshots rejouables — ADR-005, ADR-006 |
| Le produit fonctionne intégralement en régime froid, sans intégration tierce (AC12) | Le réalisé porte une colonne `source` ; aucune table ni aucun chemin de code ne présuppose de données connectées — §11 |

**Hypothèses posées** (chacune justifiée dans l'ADR correspondant, chacune réversible) :

- **H1** — Distribution web / PWA mobile-first, pas d'application native en V1. Aucun document produit ne tranchait. ADR-001.
- **H2** — « 3 accès par semaine » = 3 **journées** d'usage, pas 3 ouvertures d'écran. ADR-008.
- **H3** — Fenêtre d'accès libre à jour fixe (lundi), paramétrable sans migration. ADR-008.
- **H4** — Les seuils de sécurité de l'AC8 ne sont pas connus : ils sont modélisés comme paramètres versionnés en base, et leur absence **bloque** la mise en production. ADR-007.
- **H5** — Aucun prix d'abonnement n'est fixé. Le « 19 €/mois » des maquettes est un placeholder de `designer`. Aucun montant n'existe dans le code : le tarif est lu depuis Stripe. ADR-009.

---

## 2. Stack technique

| Couche | Choix | Justification courte |
|---|---|---|
| Client | **Next.js 16 (App Router) + React 19 + TypeScript**, PWA installable | Standard agence ; mobile-first suffisant pour la F1 ; ADR-001 |
| UI | **Tailwind CSS + shadcn/ui** | Standard agence ; les 6 maquettes Pencil sont transposables sans composant exotique |
| API | **Route Handlers versionnés `/app/api/v1/**`** + contrats Zod partagés | API-first, réutilisable par un futur client natif ; ADR-001 |
| Logique métier critique | **`@hybride/rules-engine`** — TypeScript pur, 0 I/O, déterministe | ADR-002, ADR-003 |
| Conversation & rédaction | **`@hybride/coach-llm`** — port `LlmProvider`, fournisseur UE | ADR-002, ADR-010 |
| Base de données | **Supabase (Postgres 15+), région UE**, RLS sur 100 % des tables | Standard agence ; RLS = 2ᵉ ligne de défense sur données de santé ; ADR-010, ADR-012 |
| Auth | **Supabase Auth** (email + mot de passe, magic link, reset) | Couvre l'écran S1 ; RLS s'appuie nativement sur `auth.uid()` |
| Paiement | **Stripe Billing + Payment Element embarqué**, webhooks source de vérité | Fidèle à la maquette, PCI SAQ A ; ADR-009 |
| Données tierces | **Strava** — OAuth 2.0 serveur + Webhook Events, import minimisé | US-02 ; ADR-013 |
| E-mail | **Brevo** | Standard agence, opérateur UE ; repli notification (limite Web Push iOS) |
| Push | **Web Push (VAPID)** | ADR-001, ADR-011 |
| Jobs | **Vercel Cron (Pro) + file `job_queue` Postgres** (`SKIP LOCKED`) | ADR-011 |
| Hébergement | **Vercel**, fonctions en région UE (`cdg1`/`fra1`) | Standard agence ; contrainte de localisation ADR-010 |
| Monorepo | **pnpm workspaces + Turborepo** | Rend l'isolation du moteur vérifiable en CI ; ADR-003 |
| Tests | **Vitest** (unit/intégration) + **fast-check** (property-based sur les garde-fous) + **Playwright** (E2E) | Les bornes dures de l'AC8 sont des invariants : le property-based testing est l'outil adapté |
| Observabilité | Sentry + logs structurés + tables `engine_runs` / `job_queue` / `sync_runs` | À cadrer avec `devops` |

### Arborescence

```
hybride-club/
├─ apps/web/                       # Next.js 16 — PWA
│  ├─ app/
│  │  ├─ (marketing)/              # Accueil
│  │  ├─ (auth)/                   # connexion, inscription, reset (S1)
│  │  ├─ (app)/                    # dashboard, aujourd-hui, semaine, abonnement, facturation,
│  │  │                            #   compte, donnees (US-02), score (US-02)
│  │  ├─ onboarding/               # chat, disclaimer, consentement
│  │  └─ api/v1/**                 # Route Handlers
│  ├─ components/
│  └─ e2e/                         # Playwright
├─ packages/
│  ├─ domain/                      # types + Zod (contrats API, PlanningContext, Ruleset)
│  ├─ rules-engine/                # moteur PUR (+ computeHybridScore, US-02)
│  ├─ coach-llm/                   # conversation + rédaction (ports/adapters)
│  └─ db/                          # client Supabase typé + repositories
├─ supabase/migrations/
├─ docs/adr/  docs/rulesets/  docs/db-schema.md
└─ plans/
```

---

## 3. Architecture logicielle

### 3.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/web — Next.js 16 (PWA)                                         │
│  Écrans : Accueil · Onboarding chat · Disclaimer · Consentement       │
│           Dashboard · Séance/Repas du jour · Paiement · Facturation   │
│           Connexion données · Score hybride            (US-02)        │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS — contrats Zod partagés
┌───────────────────────────▼──────────────────────────────────────────┐
│  API v1 (Route Handlers)                                             │
│  auth · validation · ENTITLEMENTS/PAYWALL · orchestration · RGPD     │
└───┬────────────┬─────────────┬──────────────┬────────────┬───────┬───┘
    │            │             │              │            │       │
    ▼            ▼             ▼              ▼            ▼       ▼
┌────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐  ┌─────────┐ ┌────────┐
│ rules- │  │ coach-   │  │  db     │  │  Stripe   │  │ Brevo / │ │ Strava │
│ engine │  │ llm      │  │(Supabase│  │           │  │ WebPush │ │ (US-02)│
│  PUR   │  │  (UE)    │  │  + RLS) │  │           │  │         │ │        │
└────────┘  └──────────┘  └─────────┘  └───────────┘  └─────────┘ └────────┘
     ▲            ▲
     └── jamais ──┘   (coach-llm ne dépend pas de rules-engine — ADR-002)
```

### 3.2 Les quatre orchestrateurs

Toute la logique applicative se ramène à quatre cas d'usage serveur, tous construits sur le même squelette : **charger le contexte → exécuter le moteur → persister la version + les traces → rendre les explications → notifier**.

| Orchestrateur | Déclencheur | AC |
|---|---|---|
| `completeOnboarding()` | validation du profil par l'utilisateur | AC1, AC2, AC3 |
| `applyDailyLog()` | saisie post-séance/repas | AC4, AC9, AC11 |
| `runWeeklyReview()` | job dimanche soir | AC5, AC6, AC7, AC14 |
| `renegotiateObjective()` | acceptation d'une proposition | AC2, AC14 |

```ts
// apps/web/lib/orchestration/regenerate-plan.ts — squelette commun
async function regeneratePlan(userId: string, trigger: PlanTrigger): Promise<PlanVersion> {
  const ruleset = await getActiveRuleset();                 // ADR-007
  const context = await buildPlanningContext(userId, now);  // snapshot complet, ADR-005
  const run     = await startEngineRun(userId, trigger, ruleset.version, hash(context));

  const result  = generatePlan(context, ruleset);           // PUR — ADR-002

  return db.transaction(async tx => {
    const version = await insertPlanVersion(tx, { context, result, trigger, run });
    await materializePlanVersion(tx, version, result.plan); // ADR-004 — chemin d'écriture UNIQUE
    await insertDecisionTraces(tx, version, result.traces); // ADR-006
    await renderExplanations(tx, version, result.traces);   // LLM + repli template
    await finishEngineRun(tx, run, version);
    return version;
  });
}
```

Aucune autre fonction du code n'écrit dans `plan_versions`, `plan_blocks`, `plan_weeks`, `planned_sessions`, `nutrition_days` ou `decision_traces`.

L'US-02 ajoute un **cinquième orchestrateur, volontairement disjoint** : `syncDataConnection()` (§13.4). Il n'écrit que du *réalisé* et ne produit aucune version de plan — il peut en revanche en déclencher une via `applyDailyLog()`, exactement comme une saisie manuelle.

L'US-03 ajoute un **sixième orchestrateur, lui aussi disjoint** : `resolveScheduleIncident()` (§14.2). Il n'écrit ni `plan_versions`, ni `planned_sessions`, ni `decision_traces` : il journalise une indisponibilité datée et rejoue le **placement**, jamais le plan. `materializeSessionPlacements()` est, pour `session_placements`, le pendant exact de `materializePlanVersion()` : chemin d'écriture unique, trois appelants, aucune écriture directe autorisée ailleurs.

### 3.3 Le paywall est une couche serveur, pas un affichage

```ts
// apps/web/lib/entitlements.ts
type Entitlement = {
  tier: 'free' | 'premium';
  canViewToday: boolean;      // toujours vrai si quota disponible
  canViewWeek: boolean;       // premium uniquement — AC13
  canViewMacro: boolean;      // premium uniquement — AC13
  freeAccess: { used: number; remaining: number; periodStart: string; periodEnd: string };
};
```

Chaque Route Handler de lecture de plan appelle `requireEntitlement()` **avant** toute requête de données. Un utilisateur libre ne reçoit jamais la semaine complète dans le payload, même masquée côté client (ADR-008 §4).

---

## 4. Le moteur à règles

### 4.1 Contrat

```ts
// packages/rules-engine/src/index.ts
export function generatePlan(context: PlanningContext, ruleset: Ruleset): EngineResult;
export function evaluateObjectiveFeasibility(ctx: PlanningContext, rs: Ruleset): FeasibilityResult; // AC2
export function evaluateStagnation(ctx: PlanningContext, rs: Ruleset): StagnationResult;            // AC6, AC7
export function evaluatePainProtocol(ctx: PlanningContext, rs: Ruleset): PainProtocolResult;        // AC9
export function diffPlanVersions(from: PlanSnapshot, to: PlanSnapshot): PlanDiff;                   // AC5
export function evaluateFreeAccess(events, now, params): FreeAccessResult;                          // AC13
export function computeHybridScore(ctx: HybridScoreContext, rs: Ruleset): HybridScoreResult;        // US-02 AC7/AC8
export function placeWeekSessions(input: PlacementInput, rs: Ruleset): PlacementResult;              // US-03 AC1/AC2/AC3
```

```ts
type PlanningContext = {
  now: string;                       // injecté — le moteur n'appelle jamais l'horloge
  timezone: string;
  profile: AthleteProfileSnapshot;   // niveau, historique, poids, sexe, âge
  sports: AthleteSportSnapshot[];    // AC10 — multi-disciplines
  objective: ObjectiveSnapshot;
  riskFlags: RiskFlagSnapshot[];     // AC3 — restrictions dures
  availability: AvailabilitySnapshot[];
  history: {
    sessionLogs: SessionLogSnapshot[];        // fenêtre glissante ≥ 8 semaines
    nutritionCheckins: NutritionCheckinSnapshot[];
    bodyMetrics: BodyMetricSnapshot[];
    completedWeeks: WeekAggregateSnapshot[];
  };
  painEpisodes: PainEpisodeSnapshot[];        // AC9 — état de la machine
  previousPlan: PlanSnapshot | null;
  dataRegime: 'cold' | 'declared' | 'connected';   // AC12 / F2
};

type EngineResult = {
  plan: PlanDraft;
  traces: DecisionTrace[];
  guardrailsApplied: GuardrailHit[];
  confidence: 'high' | 'calibrating';           // AC7
};
```

### 4.2 Pipeline interne (ordre d'exécution imposé)

```
 1. resolveRiskRestrictions      AC3   → restrictions dures issues de risk_flags
 2. resolvePainState             AC9   → zones bloquées / en pause / adaptées
 3. resolveObjectiveFeasibility  AC2   → realistic | stretch | unrealistic
 4. buildMacroBlocks             AC1   → base / développement / spécifique / affûtage
 5. placeMandatoryDeloads        AC8   → décharge tous les N blocs, NON désactivable
 6. computeWeeklyLoadTarget      AC8   → plafond de progression appliqué ici
 7. distributeAcrossSports       AC10  → charge globale, pas par sport isolé
 8. resolveInterference          AC10  → espacement intense ↔ force, mêmes groupes
 9. buildSessions (J→J+7 / J+8→J+14)  AC1, AC4
10. buildNutritionDays           AC11  → modulation à la séance + plancher de sécurité
11. applyHardGuardrails          AC8   → DERNIÈRE étape, écrase tout le reste
12. assertEveryNumberIsTraced    §5    → échoue le run si une valeur n'a pas de trace
```

Deux points d'architecture décisifs :

- **L'étape 11 est terminale.** Les garde-fous ne sont pas des paramètres d'entrée des étapes précédentes mais un filtre final qui écrase le résultat. Aucune règle ajoutée plus tard ne peut donc les contourner — même par erreur.
- **L'étape 12 est une assertion, pas un log.** Un run qui produirait une valeur chiffrée non couverte par une trace échoue et ne persiste rien. La contrainte d'auditabilité §5 est ainsi structurellement impossible à violer par oubli.

`computeHybridScore()` **n'appartient pas à ce pipeline** et n'est appelée par aucune de ses étapes (ADR-014 §6) : c'est une fonction de restitution, pas de décision.

`placeWeekSessions()` **n'appartient pas non plus au pipeline** et n'est appelée par aucune de ses étapes (ADR-016 §5) : c'est une fonction de placement, pas de décision de contenu. Elle vit dans le moteur uniquement parce qu'elle doit revérifier les garde-fous AC8/AC10 déjà implémentés — les réimplémenter ailleurs dupliquerait de la logique de sécurité.

### 4.3 Asymétrie hausse / baisse (AC4)

Le moteur reçoit `trigger` dans son contexte. Une règle produisant `direction = 'increase'` sur un trigger autre que `weekly_review` ou `objective_renegotiation` lève une erreur de run. L'invariant est vérifié à trois endroits : en sortie de moteur, par property-based testing en CI, et par requête d'audit sur `plan_diffs` en production (ADR-005 §5).

### 4.4 Protocole douleur — machine à états (AC9)

```
                       douleur légère
       aucune  ────────────────────────►  LIGHT
                                            │  adapte la séance, aucune alerte
                                            │
              N signaux consécutifs, même zone (params.pain_protocol)
                                            ▼
                                        PERSISTENT
                                            │  pause de la sollicitation de la zone
                                            │  + recommandation de consultation
                                            ▼
        douleur aiguë à l'effort ET au repos (drapeau explicite de saisie)
                                          ACUTE
                                            │  arrêt total de la zone
                                            │  orientation professionnel de santé
                                            │  AUCUNE alternative d'auto-adaptation
```

Porté par la table `pain_episodes`, mise à jour par le moteur à chaque `applyDailyLog()`. La distinction niveau 2 / niveau 3 impose une donnée de saisie que la fiche implique sans la nommer : **la douleur est-elle présente au repos ?** → champ `pain_at_rest` sur `session_logs`, à intégrer au formulaire (voir §12, point de retour vers `designer`).

---

## 5. Schéma de base de données

> **Le DDL canonique complet (34 tables en F1, 41 après l'US-02) vit désormais dans [`/docs/db-schema.md`](docs/db-schema.md).**
>
> Déplacé le 2026-08-07 : cette section portait 790 lignes de SQL, ce qui rendait le document
> d'architecture illisible et coûteux à amender à chaque arbitrage de schéma. `developer` aligne
> `supabase/migrations/**` sur `docs/db-schema.md` ; les en-têtes de migration qui citent encore
> « `08-architecture.md` §5 » sont à mettre à jour à la prochaine touche.
>
> **La présente section reste la lecture d'entrée** : elle porte les conventions de sécurité, qui
> priment sur toute table prise isolément.

### 5.1 Conventions de sécurité — non négociables

Appliquées uniformément, vérifiées par des tests d'intégration dédiés (§8) :

- **RLS activée sur 100 % des tables**, avec au moins une policy explicite. Aucune exception.
- **Tables utilisateur** (saisies, profil) : `SELECT/INSERT/UPDATE` par le propriétaire.
- **Tables produites par le moteur** (plans, versions, traces, explications, diagnostics, scores) : `SELECT` par le propriétaire **uniquement**. Aucune policy d'écriture ⟹ écriture réservée au `service_role`, qui contourne RLS. L'utilisateur ne peut jamais fabriquer un plan ni une trace.
- **Tables immuables** (`plan_versions`, `decision_traces`, `consents`) : trigger `BEFORE UPDATE OR DELETE` levant une exception, **y compris pour le `service_role`**. Une seule dérogation, décrite en §5.2.
- **Référentiels** (`sports`, `consent_documents`, `rulesets`, `data_providers`, `external_sport_mappings`) : `SELECT` pour `authenticated`, écriture `service_role`.
- **Tables de santé** (`athlete_profiles`, `session_logs`, `body_metrics`, `risk_flags`, `nutrition_checkins`) : policies `INSERT` **et `UPDATE`** conditionnées à `has_active_consent(auth.uid(), 'health_data_processing')`. Un retrait de consentement ferme la modification, pas seulement la création (ADR-010 §2, ADR-012 §2).
- **Secrets tiers** (`data_connection_secrets`) : RLS activée, **aucune policy**, et `revoke all … from authenticated, anon` explicite. Un jeton d'accès à un compte tiers n'est lisible par aucun rôle client, quel que soit le `select` écrit un jour dans une route (ADR-013 §2).
- **Consentements** : aucune policy d'écriture pour `authenticated`. `consents` s'écrit **exclusivement** via `service_role`, depuis une route API qui résout elle-même la version courante du document et calcule `ip_hash`/`user_agent`. Une FK composite vers `consent_documents` interdit de référencer un document inexistant (ADR-012 §1).
- **Privilèges** : `UPDATE` n'est **jamais** accordé par défaut à `authenticated`. C'est le seul privilège qu'une policy RLS ne sait pas restreindre à la colonne près : il est donc accordé table par table, et **au niveau colonne** dès que seule une partie de la ligne est légitimement modifiable (`plan_diffs(acknowledged_at)`, `notifications(read_at)`, `objectives(label, target_date, …)`, `schedule_incidents(acknowledged_at)` depuis l'US-03, …). Un oubli de GRANT échoue bruyamment, au lieu de sur-autoriser en silence (ADR-012 §3). **Depuis l'US-02, `INSERT` suit la même règle** dès qu'une colonne de la table est décidée par le serveur (`session_logs`, `body_metrics` — ADR-015 §4).
- **Conformité hors RLS** : quand un chemin d'écriture légitime passe par `service_role` (donc **contourne RLS**), la garantie de consentement est portée par un **trigger**, pas par une policy — `enforce_connected_source_consents()` sur les lignes `source = 'connected'` (ADR-013 §5).
- **Fonctions** : `EXECUTE` n'est pas accordé à `PUBLIC` par défaut ; chaque fonction est ouverte explicitement au rôle qui en a besoin. Toute fonction `security definer` est révoquée de `public`, `anon` et `authenticated` (ADR-012 §3).

### 5.2 La dérogation d'effacement (art. 17 RGPD)

L'immuabilité et le droit à l'effacement sont en tension frontale : un trigger qui refuse tout `UPDATE`/`DELETE` bloque à la fois la cascade de suppression et l'anonymisation. La résolution (ADR-010 §8) :

- `forbid_mutation()` accepte la mutation **si et seulement si** le GUC de session `app.erasure_user_id` vaut exactement le `user_id` de la ligne **et** que le rôle effectif est membre de `service_role`. Les deux conditions sont nécessaires : un GUC de namespace applicatif est positionnable par n'importe quel rôle en Postgres, il ne peut donc pas servir seul de barrière.
- Ce GUC n'est positionné que par `public.erase_account(uuid)` — `security definer`, exécutable par `service_role` seul, `set local` (portée transaction), appelée par `POST /api/v1/account/delete`.
- **L'effacement est une suppression réelle**, pas une pseudonymisation de traces. Des `decision_traces` conservées « à fin statistique » avec un `user_id` nulifié resteraient réidentifiables par corrélation (`engine_run_id`, `plan_version_id`, contenu de `inputs_used`) : ce serait de la pseudonymisation vendue comme de l'anonymisation.
- **Seule exception assumée : le registre `consents`.** Il n'a plus de FK vers `auth.users`, survit à la suppression du compte sous forme pseudonyme, et voit `ip_hash`/`user_agent` effacés. Motif : prouver le consentement recueilli est une obligation d'`accountability` (art. 5.2 et 7.1) et un intérêt défensif (art. 17.3.e). C'est une décision, pas un effet de bord du trigger.

### 5.3 Points de vigilance à la mise en production

- `stripe_events.payload` peut contenir des données personnelles (e-mail de facturation) et n'est **pas** couvert par `erase_account()`. **Résolu (2026-08-09, correction I3)** : `purge_stale_stripe_events()` (`0013_billing_robustness.sql`) supprime les événements de plus de 60 jours, appelée par le cron quotidien `/cron/purge-stripe-events` (§6.8).
- Le registre `consents` a une durée de conservation tranchée par le fondateur — **5 ans** à compter du dernier événement (ADR-010, question ouverte n°4) — mais **le job de purge à cette échéance reste non implémenté** (§12, question 8) : le registre grossit sans purge automatique.
- Le seed de `consent_documents` est un **prérequis dur relatif à l'environnement** : en production, aucun document n'est `is_current` tant que la migration d'activation juridique n'est pas livrée, donc l'onboarding y est bloqué par construction (ADR-010 §9, `docs/db-schema.md` §9.3). Hors production, `supabase/seed.sql` active la version provisoire. **US-02** : le même verrou s'applique au document `third_party_data_import` — en production, la connexion d'une source répond `503 CONSENT_DOCUMENT_UNAVAILABLE` tant que le texte n'est pas validé, sans jamais bloquer le coach (AC9).
- **US-02** : la souscription webhook Strava est **unique par application** et se crée hors du code applicatif (acte d'exploitation `devops`). Une preview ne peut pas avoir la sienne sans une seconde application Strava (ADR-013).

---

## 6. Contrats d'API

Toutes les routes sont sous `/app/api/v1/`. Conventions communes :

- authentification par session Supabase (cookie) ; `401` sinon ;
- validation d'entrée **Zod** systématique, schémas exportés depuis `@hybride/domain` et réutilisés côté client ;
- erreurs normalisées : `{ error: { code, message, details? } }` avec des codes stables (`VALIDATION_FAILED`, `PAYWALL_REQUIRED`, `CONSENT_REQUIRED`, `CALIBRATION_IN_PROGRESS`, `ENGINE_FAILED`, `RATE_LIMITED`, `CONSENT_DOCUMENT_UNAVAILABLE`, et pour l'US-02 `PROVIDER_UNAVAILABLE`, `CONNECTION_NOT_FOUND`, et pour l'US-03 `SESSION_NOT_REPORTABLE`, `PLACEMENT_FAILED`) ;
- toute route de lecture de plan est `dynamic = 'force-dynamic'`, `Cache-Control: no-store`.

> Les contrats de l'US-02 (connexions, synchronisation, score hybride, vue centralisée) sont en **§13.3**.
> Les contrats de l'US-03 (placement, signalement d'imprévu, extension de `/plan/week`) sont en **§14.5**.

### 6.1 Onboarding (AC1, AC2, AC3)

| Route | Méthode | Entrée | Sortie | Notes |
|---|---|---|---|---|
| `/onboarding/session` | POST | — | `{ sessionId, step, messages[] }` | Crée ou reprend la session |
| `/onboarding/session/:id/messages` | POST | `{ content }` | **SSE** : `token` → `draft_patch` → `next_step` | État « le coach écrit » (`04-flow.md`) ; `is_reformulation` sur réponse incomprise |
| `/onboarding/session/:id/disclaimer` | POST | `{ documentVersion }` | `{ acknowledged: true }` | AC3 — écran dédié ; écrit `consents` en `service_role` après avoir vérifié que `documentVersion` est bien la version courante |
| `/consents` | POST | `{ code, granted }` | `{ consentId, documentVersion }` | AC3 — santé, séparé du disclaimer. **La version n'est pas fournie par le client** : le serveur résout `is_current`, calcule `ip_hash` et `user_agent`, insère en `service_role` (ADR-012 §1) |
| `/onboarding/session/:id/complete` | POST | `{ confirmedProfile }` | voir ci-dessous | AC1/AC2 — **l'utilisateur valide, pas le LLM** |

```ts
// POST /api/v1/onboarding/session/:id/complete — la bifurcation AC1 / AC2
type CompleteOnboardingResponse =
  | { outcome: 'plan_generated';
      planVersionId: string;
      today: TodayPlan; }
  | { outcome: 'objective_negotiation';                 // AC2 — jamais de plan inatteignable silencieux
      objectiveId: string;
      feasibility: 'unrealistic';
      reasoning: { short: string; long: string; decisionTraceIds: string[] };
      proposals: Array<{ id: string; kind: 'intermediate_objective' | 'adjusted_deadline';
                         label: string; targetDate: string; rationale: string }>;
      canKeepOriginal: true; };                          // AC2 — en connaissance de cause
```

### 6.2 Objectif (AC2, AC14)

| Route | Méthode | Entrée | Sortie |
|---|---|---|---|
| `/objectives/current` | GET | — | `{ objective, status, daysToTarget, endOfObjective?: EndOfObjectiveOffer }` |
| `/objectives/:id/negotiation` | POST | `{ decision: 'accept_proposal' \| 'keep_original', proposalId? }` | `{ planVersionId, today }` |
| `/objectives/transition` | POST | `{ choice: 'new_objective' \| 'recovery_phase', newObjective? }` | `{ planVersionId }` — AC14 |

`status`, `feasibility`, `feasibility_trace_id`, `proposed_alternative` et `user_decision` ne sont **jamais** écrits par le client : ces routes les écrivent en `service_role`, et le GRANT colonne l'interdit au niveau base (ADR-012 §3).

```ts
// AC14 — jamais de vide dans le plan après la date cible
type EndOfObjectiveOffer = {
  reachedOn: string;
  options: Array<{ kind: 'new_objective' | 'recovery_phase'; label: string; explanation: Explanation }>;
};
```

### 6.3 Plan (AC1, AC5, AC13)

```ts
// GET /api/v1/plan/today — accès libre (consomme 1 accès/jour, ADR-008)
type TodayPlan = {
  date: string;
  session: {
    id: string; sportCode: string | null; sessionType: SessionType;
    durationMin: number | null; loadUnits: number; intensityZone: string | null;
    prescription: Prescription | null;
    interferenceNote: string | null;                    // AC10
    explanation: { short: string; explanationId: string };  // AC1 — long via /explanations/:id
    log: SessionLogSummary | null;
  } | null;                                              // null = jour de repos (état vide `04-flow.md`)
  nutrition: {
    kcalTarget: number; proteinG: number; carbsG: number; fatG: number;
    modulationReason: 'rest' | 'endurance' | 'intensity';   // AC11
    advice: { pre: string; during: string; post: string };
    explanation: { short: string; explanationId: string };
    checkin: NutritionCheckinSummary | null;
  } | null;
  activePainNotice: PainNotice | null;                   // AC9 — jamais derrière le paywall
  entitlement: Entitlement;                              // AC13 — pilote l'UI, ne l'autorise pas
};
```

| Route | Méthode | Droit | Sortie |
|---|---|---|---|
| `/plan/today` | GET | libre (quota) | `TodayPlan` |
| `/plan/week?weekStart=` | GET | **premium** | `WeekPlan` — `402 PAYWALL_REQUIRED` sinon |
| `/plan/macro` | GET | **premium** | `MacroPlan` (blocs jusqu'à l'objectif) |
| `/plan/reviews/latest` | GET | premium | `PlanDiffView` — AC5 |
| `/plan/reviews/:diffId/acknowledge` | POST | premium | `{ acknowledgedAt }` — n'écrit que `acknowledged_at` |
| `/explanations/:id` | GET | libre | `{ short, long, confidence, traces?: TraceSummary[] }` — « en savoir plus » AC5 |

```ts
// GET /api/v1/plan/reviews/latest — AC5
type PlanDiffView = {
  diffId: string;
  fromWeek: string | null;                               // null = première semaine, cas explicite
  toWeek: string;
  summary: { short: string; long: string };
  items: Array<{
    kind: PlanDiffItemKind; scope: 'week' | 'day' | 'block';
    targetDate?: string;
    before: unknown; after: unknown;
    direction: 'increase' | 'decrease' | 'neutral';
    explanation: { short: string; explanationId: string };
  }>;
};
```

### 6.4 Saisie quotidienne (AC4, AC9, AC11)

```ts
// POST /api/v1/session-logs — ajustement SYNCHRONE (ADR-011 §6)
type CreateSessionLogInput = {
  plannedSessionId: string | null;
  loggedDate: string;
  completion: 'done' | 'partial' | 'not_done';
  notDoneReason?: string;
  actualDurationMin?: number;
  rpe?: number;            // 1-10
  freshness?: number;      // 1-5
  pain: 'none' | 'light' | 'pain';
  painZone?: BodyZone;
  painAtRest?: boolean;    // AC9 niveau 3
  comment?: string;
  // — US-02 (ADR-015 §5) : séance HORS PLAN
  sportCode?: string;
  sessionType?: SessionType;
  startedAt?: string;      // ISO datetime — sert aussi à la réconciliation AC5
};

type CreateSessionLogResponse = {
  logId: string;
  adjustment: {
    applied: boolean;
    direction: 'decrease' | 'none';        // JAMAIS 'increase' ici — AC4, invariant ADR-005 §5
    planVersionId: string | null;
    affectedDates: string[];
    explanation: { short: string; explanationId: string } | null;
  };
  painProtocol: {                          // AC9
    level: 'none' | 'light' | 'persistent' | 'acute';
    zoneBlocked: boolean;
    referral: { required: boolean; message: string } | null;
  };
  nextSession: TodayPlan['session'] | null;
  reconciliation?: {                       // US-02 AC5 — jamais silencieux
    mergedIntoLogId: string;
    reason: 'duplicate_connected_wins';
    message: string;                       // « j'ai reconnu ta sortie de ce matin… »
  } | null;
};
```

| Route | Méthode | Notes |
|---|---|---|
| `/session-logs` | POST / PATCH | Ne consomme **pas** d'accès libre (ADR-008 §5) ; exige le consentement santé (`403 CONSENT_REQUIRED`) **en création comme en modification** |
| `/session-logs/:id/unmerge` | POST | **US-02** — annule une fusion de doublon (AC5), rend les deux lignes comptables |
| `/nutrition-checkins` | POST / PATCH | Saisie légère uniquement : `adherence` + `energy` (AC11 — pas de carnet) ; même exigence de consentement |
| `/body-metrics` | POST | Poids / sommeil / FC repos — santé. Une correction est une nouvelle ligne, pas une modification |

### 6.5 Progression et stagnation (AC6, AC7)

```ts
// GET /api/v1/progress/diagnosis
type ProgressDiagnosisResponse =
  | { status: 'calibration';                             // AC7 — sortie NOMINALE, pas une erreur
      weeksAvailable: number; weeksRequired: 4;
      message: string;                                   // « je ne peux pas encore conclure »
      confidence: 'calibrating'; }
  | { status: 'no_stagnation'; indicators: IndicatorTrend[]; explanation: Explanation }
  | { status: 'stagnation';                              // AC6
      indicator: 'time' | 'load' | 'weight' | 'energy';
      diagnosis: 'understimulation' | 'overload' | 'nonadherence' | 'inconclusive';
      evidence: Array<{ label: string; current: number; previous: number; sourceIds: string[] }>;
      proposedAdaptation: { summary: string; planVersionId: string | null };
      explanation: Explanation; };
```

### 6.6 Paywall et abonnement (AC13)

| Route | Méthode | Entrée | Sortie |
|---|---|---|---|
| `/entitlements` | GET | — | `Entitlement` — autorité unique, `no-store` |
| `/billing/offer` | GET | — | `{ priceId, amountCents, currency, interval, trialDays }` — **lu depuis Stripe**, aucun montant en dur |
| `/billing/subscription-intent` | POST | — | `{ clientSecret, subscriptionId }` (ADR-009 §1) |
| `/billing/invoices` | GET | — | `Invoice[]` — écran S2 |
| `/billing/cancel` | POST | `{ atPeriodEnd: true }` | `{ status, currentPeriodEnd }` |
| `/webhooks/stripe` | POST | signature Stripe | `200` — idempotent, `runtime = 'nodejs'`, corps brut |

### 6.7 Compte et RGPD (ADR-010, ADR-012)

| Route | Méthode | Effet |
|---|---|---|
| `/account/export` | GET | Export JSON intégral (profil, plans, logs, explications, traces, consentements, **connexions et scores** depuis l'US-02) |
| `/account/delete` | POST | Appelle `erase_account(uuid)` en `service_role` : suppression **réelle** de toutes les données personnelles ; seul le registre `consents` survit, pseudonymisé (ADR-010 §8). Confirmation forte exigée côté client |
| `/consents` | POST | Enregistre un consentement (`granted = true`) — version résolue par le serveur |
| `/consents/:code/revoke` | POST | Retrait = **nouvelle ligne** `granted = false` (jamais un UPDATE) ; purge des données de santé ; coach en mode dégradé **explicite**. **US-02** : le retrait de `third_party_data_import` révoque en cascade toutes les connexions actives et supprime les jetons |
| `/push/subscriptions` | POST / DELETE | Abonnement Web Push |

### 6.8 Routes internes (cron)

Protégées par en-tête `Authorization: Bearer ${CRON_SECRET}`, non exposées à l'utilisateur.

**Correction de contrat (constat du `developer`, confirmé à la revue de fin de projet)** : les quatre
routes sont exposées en **`GET` et `POST`**, pas seulement en `POST` comme le contrat le laissait
entendre initialement. Vercel Cron invoque exclusivement en `GET` (documentation Vercel : « a
scheduled Cron Job invokes an endpoint via GET ») ; `POST` est conservé pour un rejeu manuel ou un
test. Les deux méthodes partagent la même garde `CRON_SECRET`, fail-closed si la variable est absente
(`isAuthorizedCronRequest()`).

| Route | Méthode | Fréquence | Rôle |
|---|---|---|---|
| `/cron/enqueue-weekly-reviews` | GET, POST | horaire | Enrôle les utilisateurs dont l'heure locale atteint dimanche soir (ADR-011) ; pagination et fenêtre `hour >= 18` (correction I4) |
| `/cron/enqueue-objective-checks` | GET, POST | quotidienne | AC14 — dates cibles atteintes |
| `/cron/drain-jobs` | GET, POST | toutes les 5 min | Exécute les lots (`FOR UPDATE SKIP LOCKED`, `claim_job_queue()`/`requeue_stuck_job_queue()` — `0011_job_queue_claim.sql`) |
| `/cron/purge-stripe-events` | GET, POST | quotidienne | Purge `stripe_events` au-delà de 60 jours (`purge_stale_stripe_events()` — `0013_billing_robustness.sql`, correction I3, §5.3 question 9 close) |
| `/cron/reconcile-data-sources` | GET, POST | quotidienne | **US-02** — filet de sécurité de la synchronisation : rejoue une fenêtre de 7 jours par connexion active (ADR-013 §1) |
| `/cron/enqueue-schedule-closeouts` | GET, POST | horaire | **US-03** — enrôle les clôtures d'imprévu des utilisateurs dont l'heure locale atteint 03:00 (ADR-017 §1) |

---

## 7. Traitements périodiques et notifications

Voir ADR-011 pour la décision complète. Séquence de la révision hebdomadaire :

```
Cron horaire ──► enqueue-weekly-reviews ──► job_queue (clé 'weekly_review:{user}:2026-W32')
                                                │
                        drain-jobs (5 min) ─────┘
                                │
                                ├─ buildPlanningContext            (8 semaines d'historique)
                                ├─ evaluateStagnation              AC6 / AC7 → stagnation_diagnoses
                                ├─ generatePlan(trigger='weekly_review')  ← seul trigger autorisant une hausse
                                ├─ plan_versions (is_weekly_baseline = true)
                                ├─ diffPlanVersions(baseline N-1, baseline N) → plan_diffs
                                ├─ renderExplanations (LLM, repli template si échec/latence)
                                └─ notifications « ta semaine est prête » → Web Push + e-mail Brevo
```

Points de vigilance intégrés :

- un échec LLM **ne fait pas échouer** le job (dégradation gracieuse, ADR-011 §4) ;
- la notification est doublée d'un **badge persistant** dans le Dashboard, seule garantie réellement fiable compte tenu des limites du Web Push sur iOS ;
- un job en échec après N tentatives passe en `abandoned` et déclenche une alerte — jamais un silence.

L'US-02 ajoute trois `kind` à la même file, sans nouvelle infrastructure : `strava_backfill`, `strava_activity_sync`, `strava_reconcile` (§13.4).

L'US-03 en ajoute deux, toujours sans nouvelle infrastructure : `refresh_placements` (enrôlé par un **trigger de base** sur `availability_slots`, seul moyen de couvrir un chemin d'écriture client direct — `docs/db-schema.md` §11.4) et `schedule_closeout` (clôture d'imprévu, ADR-017).

---

## 8. Sécurité, RGPD, RLS

Détail complet : ADR-010 (données de santé), ADR-012 (modèle de privilèges), ADR-013 §5 (import tiers). Synthèse opérationnelle :

| Règle | Mise en œuvre |
|---|---|
| RLS sur 100 % des tables | 41 tables, `enable row level security` + policy explicite. Test CI dédié qui échoue si une table sans RLS apparaît. |
| L'utilisateur ne fabrique jamais un plan | Aucune policy d'écriture sur les tables du moteur : `service_role` seul. |
| L'utilisateur ne fabrique jamais sa charge réalisée ni sa provenance | `INSERT` restreint colonne par colonne sur `session_logs`/`body_metrics` (ADR-015 §4). |
| Consentement santé avant saisie **et avant modification** | Policies `INSERT` et `UPDATE` conditionnées par `has_active_consent()` sur `session_logs`, `body_metrics`, `risk_flags`, `athlete_profiles`, `nutrition_checkins`. |
| Consentement d'import tiers avant toute écriture `connected` | Trigger `enforce_connected_source_consents()` — s'applique **aussi au `service_role`**, seul moyen de couvrir un chemin d'écriture serveur (ADR-013 §5). |
| L'utilisateur ne se délivre pas son propre consentement | Aucune policy `INSERT` sur `consents` ; écriture `service_role` seule ; FK composite vers `consent_documents`. |
| Un jeton d'accès tiers n'est lisible par aucun client | `data_connection_secrets` : RLS sans policy + `revoke all`, jetons chiffrés `pgcrypto` (ADR-013 §2). |
| Immuabilité de l'audit | Triggers `forbid_mutation()` sur `plan_versions`, `decision_traces`, `consents`. Dérogation unique : contexte d'effacement RGPD, scopé à un `user_id` **et** à `service_role`. |
| Écriture partielle plutôt que totale | `UPDATE` jamais accordé par défaut ; GRANTs au niveau colonne sur `plan_diffs`, `notifications`, `objectives`, `session_logs`, `athlete_profiles`, `profiles`, `nutrition_checkins`, `schedule_incidents(acknowledged_at)`. |
| Fonctions non exposées par défaut | `EXECUTE` retiré de `PUBLIC` ; `erase_account()` et `claim_connection_refresh()` réservées à `service_role`. |
| Effacement effectif (art. 17) | `POST /account/delete` → `erase_account()` : suppression réelle en cascade ; seul le registre `consents` survit, pseudonymisé. |
| Isolation entre utilisateurs | Tests d'intégration RLS : l'utilisateur A ne lit rien de B, sur chaque table. |
| Secrets | Variables Vercel uniquement ; `sk_live_*` en production seule ; hook `secret-scan` du plugin. **US-02** : `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_PATH_SECRET`, `STRAVA_VERIFY_TOKEN`, `DATA_TOKEN_ENC_KEY`, `OAUTH_STATE_SECRET`. |
| Minimisation LLM | Aucune donnée directement identifiante ; explications rendues à partir des seules `DecisionTrace`. |
| Minimisation à l'import | Ni FC, ni GPS, ni texte libre importés de Strava (ADR-013 §4). |
| Localisation | Supabase UE, fonctions Vercel `cdg1`/`fra1`, Brevo UE, Mistral AI (UE). **Strava est un sous-traitant hors UE** — voir §12, question ouverte n°12. |
| Rate limiting | Sur `/onboarding/session/:id/messages` (coût LLM), `/billing/subscription-intent`, et `/webhooks/strava/*` (endpoint non signé). |

La liste complète des tests d'intégration attendus sur le schéma est en fin de [`/docs/db-schema.md`](docs/db-schema.md).

---

## 9. Environnements et déploiement

| Environnement | Base | Stripe | LLM | Ruleset |
|---|---|---|---|---|
| Local | Supabase local (`supabase start`) | `sk_test` + `stripe listen` | mock déterministe par défaut | `0.2.0-dev` |
| Preview (par PR) | projet Supabase existant **`hybrideclub`** (`eu-west-1`) | `sk_test` | fournisseur réel, quota bridé | `0.2.0-dev` |
| Test (CI) | projet Supabase isolé | fixtures webhook | mock | fixture |
| Production | projet Supabase `prod` (UE) — **séparé, à créer plus tard** (confirmé 2026-08-06) | `sk_live` | fournisseur UE, DPA signé | `1.0.0` — **refus de démarrage si un garde-fou est `null`** |

**Note (2026-08-06)** : le fondateur réutilise un projet Supabase existant `hybrideclub` (région `eu-west-1`, conforme à la contrainte UE) comme base dev/preview plutôt qu'un projet créé pour cette feature. Rôle confirmé : dev/preview uniquement, un projet séparé sera créé pour la production le moment venu (séparation dev/prod classique préservée). Projet vierge, tout juste créé (confirmé 2026-08-06) — `developer` peut appliquer les migrations directement, aucun schéma existant à préserver.

**Note (2026-08-07)** : la base étant encore vierge de données réelles, les corrections de schéma issues de l'arbitrage du 2026-08-07 sont appliquées **en modifiant les migrations existantes** (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0009`) plutôt qu'en empilant une migration corrective — le schéma reste lisible d'un seul tenant. Cette liberté disparaît dès la première donnée de production.

**Note (2026-08-12, US-02)** : cette liberté n'est **plus utilisée**. Depuis `0011`, les évolutions de schéma sont empilées en migrations additives, et l'US-02 suit cette règle (`0015` → `0018`, uniquement `create table` et `alter table`). Motif : la F1 est mergée sur `main`, des bases de preview portent des données de test que `developer` et `tester` réutilisent, et une réécriture de migration invaliderait leur état sans avertissement.

**Note (2026-08-12, US-02)** : côté Strava, l'environnement local et les previews partagent **une seule application Strava** (une souscription webhook par application). Deux conséquences opérationnelles : (a) le développement local reçoit les webhooks via un tunnel (`ngrok` ou équivalent) **ou** s'appuie sur la réconciliation manuelle (`POST /cron/reconcile-data-sources`) ; (b) une seconde application Strava sera nécessaire pour la production, avec ses propres `client_id`/`client_secret`. À cadrer avec `devops`.

Branches : `main` (prod) ← `develop` (intégration) ← `feature/US-XX-slug`. Aucun commit direct sur `main`/`develop`.

Pipeline CI attendu (à câbler par `devops`) : `lint` → `typecheck` → `test:unit` (dont pureté du moteur et property-based garde-fous) → `test:integration` (dont policies RLS, immuabilité, privilèges colonne, effacement) → `build` → `test:e2e` → déploiement preview.

---

## 10. Couverture des 14 critères d'acceptation

| AC | Mécanisme technique principal | Où |
|---|---|---|
| AC1 — plan initial + 3 échelles + explication citant la donnée | `completeOnboarding()` → `generatePlan` → `plan_blocks`/`plan_weeks`/`planned_sessions` (`detail_level`) + `explanations.decision_trace_ids` | §4.2, `db-schema.md` §5, ADR-004 |
| AC2 — objectif hors de portée | `evaluateObjectiveFeasibility` → `outcome: 'objective_negotiation'`, `objectives.proposed_alternative`, `user_decision` | §6.1, §6.2 |
| AC3 — filtre risque, disclaimer, consentement séparé | 2 écrans distincts, `consent_documents` versionnés, écriture `service_role` + FK composite, policies RLS conditionnées (INSERT **et** UPDATE), `risk_flags.restrictions` en garde-fous durs | §5.1, ADR-010, ADR-012 |
| AC4 — ajustement immédiat à la baisse, hausse hebdo seule | `POST /session-logs` synchrone ; invariant `direction='increase'` interdit hors `weekly_review` ; pas de file de rattrapage (le plan est reprojeté) | §6.4, ADR-005 §5 |
| AC5 — révision hebdo + diff explicable | Job dimanche + `is_weekly_baseline` + `plan_diffs` matérialisé + `explanations.long_text` ; `items` protégé par GRANT colonne | §7, ADR-005, ADR-012 |
| AC6 — stagnation, 3 diagnostics | `evaluateStagnation` → `stagnation_diagnoses` + contrainte `no_hardening_on_nonadherence` | `db-schema.md` §6, §6.5 |
| AC7 — phase de calibration | `weeks_available < 4` ⇒ `status='calibration'`, `confidence='calibrating'` — sortie nominale du moteur | §6.5, ADR-006 §2 |
| AC8 — garde-fous durs | `applyHardGuardrails` en **dernière** étape + `rulesets.params.guardrails` + `is_hard_guardrail` sur les traces | §4.2, ADR-007 |
| AC9 — protocole douleur 3 niveaux | `pain_episodes` (machine à états) + `pain_at_rest` + `referral_issued` ; hors paywall | §4.4, ADR-008 §5 |
| AC10 — interférence entre disciplines | `distributeAcrossSports` + `resolveInterference` sur `muscle_groups` ; `interference_note` remonté dans l'explication | §4.2, `db-schema.md` §5 |
| AC11 — nutrition modulée, sans carnet | `nutrition_days` (modulation + `kcal_safety_floor` avec CHECK) ; saisie limitée à `adherence` + `energy` | `db-schema.md` §5-6 |
| AC12 — régime froid | `data_regime='cold'`, `source='declared'` (tous deux hors GRANT client) ; aucun chemin de code ne requiert de source connectée | `db-schema.md` §2, §11 |
| AC13 — paywall | `requireEntitlement()` côté serveur + `free_access_events` + réponses tronquées à la source | §3.3, ADR-008 |
| AC14 — fin d'objectif | Cron quotidien + `EndOfObjectiveOffer` + trigger `objective_end` | §6.2, §7 |

La couverture des 10 critères de l'US-02 est en **§13.7**.

---

## 11. Anticipation Features 2 et 3

**Feature 2 — Centralisation des données / score hybride : ANTICIPATION CONSOMMÉE (2026-08-12).**

L'anticipation posée en F1 s'est vérifiée sur trois points, et a manqué sur un quatrième — c'est ce constat qui structure §13 :

| Anticipation F1 | Verdict à l'US-02 |
|---|---|
| `data_source` (`declared`\|`connected`) présent sur `session_logs` et `body_metrics`, hors GRANT client | **Tenue.** Une activité Strava s'insère bien comme une ligne de plus. Il a fallu compléter par un lien vers la connexion d'origine (`data_connection_id`) pour que l'AC10 soit servable sans réécrire `source` (ADR-015 §3), et restreindre l'`INSERT` colonne, que la F1 laissait ouvert (ADR-015 §4). |
| `athlete_profiles.data_regime` + `PlanningContext.dataRegime` | **Tenue.** Le moteur distingue déjà les régimes ; il ne restait qu'à faire évoluer la valeur au fil des connexions (§13.5). |
| « Le score hybride consommera `load_units` » (ADR-004 §4) | **Partiellement tenue.** `load_units` n'existait que sur le **prévu**. Le réalisé n'en portait aucune, et `build-planning-context.ts` laissait `actualLoadUnits` à `null` en dur. L'US-02 a dû créer la charge réalisée (ADR-015 §1) : sans elle, le score hybride n'avait aucune matière première. |
| « À ajouter alors : `data_connections`, `sync_runs`, et une résolution de doublons » | **Fait**, plus quatre autres tables que l'anticipation n'avait pas vues : `data_providers`, `data_connection_secrets`, `external_sport_mappings`, `hybrid_scores` (`docs/db-schema.md` §10). |

**Feature 3 — Planning selon emploi du temps : ANTICIPATION CONSOMMÉE (2026-08-12).**

| Anticipation F1 | Verdict à l'US-03 |
|---|---|
| `availability_slots` déjà capté par l'onboarding | **Tenue** — consommé, jamais modifié. **Mais incomplet** : la table ne porte **aucune heure** (ni début, ni fin), ce qui interdit tout placement à la minute près et impose une grille paramétrée (ADR-016 §4). |
| « La F3 ajoutera le placement horaire **sans restructurer la table** `planned_sessions` » | **Tenue, plus strictement que prévu** : `planned_sessions` n'est ni restructurée ni même altérée. Le placement vit dans une table dédiée, faute de quoi la projection aurait divergé de son snapshot immuable (ADR-016 §1). |
| « F1 décide QUOI et COMBIEN, F3 décide QUAND » | **Tenue et durcie** : l'AC2 accorde à la F3 la **date effective** en plus de l'heure. La frontière est portée par le type de sortie de l'algorithme, qui ne comporte aucun champ de contenu (§14.1). |
| Non anticipé | La **survie d'un imprévu à une régénération de plan** : `planned_sessions` est rejetée 2 à 5 fois par semaine. Résolu en modélisant l'imprévu comme une indisponibilité **datée**, fait utilisateur et non artefact de plan (ADR-016 §3). |

**Points de contact laissés par l'US-02 à l'attention de l'architecte F3** : voir §13.8 (réponses apportées).

---

## 12. Hypothèses et questions ouvertes

### Hypothèses posées par `architect` (à confirmer, chacune réversible)

| # | Hypothèse | ADR | Coût de retour arrière |
|---|---|---|---|
| H1 | Web / PWA, pas de natif en V1 | ADR-001 | Moyen (ajout d'un client, back-end inchangé) |
| H2 | 1 accès libre = 1 journée d'usage | ADR-008 | Nul (paramètre) |
| H3 | Fenêtre d'accès à jour fixe (lundi) | ADR-008 | Nul (paramètre, même journal) |
| H4 | Seuils AC8 en base, bloquants en production | ADR-007 | Nul |
| H5 | Aucun prix en dur (Stripe fait foi) | ADR-009 | Nul |
| H6 | Monorepo pnpm | ADR-003 | Faible |
| H7 | Payment Element embarqué plutôt que Checkout hébergé | ADR-009 | Faible |
| H8 | Fuseau par défaut `Europe/Paris` | ADR-011 | Nul |
| H9 | Conservation du registre `consents` après suppression de compte, sous forme pseudonyme | ADR-010 §8 | Faible (une ligne dans `erase_account`) — **à valider juridiquement** |
| **H10** | **US-02** — Webhook Strava comme mécanisme principal + réconciliation quotidienne de 7 jours | ADR-013 §1 | Nul (le polling seul reste possible en désactivant la souscription) |
| **H11** | **US-02** — Rattrapage initial de **90 jours** à la connexion | ADR-013 §1 | Nul (paramètre `sync.initial_backfill_days`) |
| **H12** | **US-02** — Import **sans** FC ni GPS ni texte libre | ADR-013 §4 | Moyen (nouvelle version du document de consentement, pas seulement une migration) |
| **H13** | **US-02** — Score sur fenêtre **28 jours**, 3 composantes (charge 0,5 / régularité 0,3 / hybridité 0,2), normalisé 0-100 | ADR-014 §1-§2 | Nul (paramètres de ruleset) |
| **H14** | **US-02** — Calibration du score à **4 semaines**, paramètre **propre** aligné sur celui de la F1 | ADR-014 §4 | Nul (paramètre) |
| **H15** | **US-02** — Réconciliation automatique (le connecté est portant, le déclaré enrichit), **réversible** par l'utilisateur | ADR-015 §2 | Faible (inverser la priorité est un paramètre ; l'arbitrage manuel à l'import serait un écran nouveau) |
| **H16** | **US-02** — `source` immuable, provenance affichée **dérivée** de l'état de la connexion | ADR-015 §3 | Faible |
| **H17** | **US-03** — Placement **dérivé** et matérialisé hors des tables du moteur | ADR-016 §1 | Nul (table reconstructible par recalcul) |
| **H18** | **US-03** — Granularité horaire : sous-créneaux fixes sur une **grille de 30 min**, bornes au ruleset | ADR-016 §4 | Nul (paramètre ; le stockage `time` reste à la minute) |
| **H19** | **US-03** — Imprévu = **indisponibilité datée**, fenêtre neutralisée = créneau occupé ± 120 min | ADR-016 §3 | Nul (paramètre `incident_block_margin_min`) |
| **H20** | **US-03** — Clôture d'imprévu à **03 h locale J+1**, 4 issues journalisées | ADR-017 §1 | Nul (paramètre `closeout_local_hour`) |

### Questions ouvertes de la fiche F1, statut après architecture

| Question fiche §7 | Statut |
|---|---|
| 1. Sources documentaires du moteur, maintenance | **Toujours ouverte** (produit). Support technique prêt : `rulesets.source_refs`, `docs/rulesets/`. |
| 2. Valeurs des garde-fous (N, plafonds) | **Toujours ouverte, mais non bloquante pour développer**. Bloque la mise en production (ADR-007). |
| 3. Formulation « coach IA vs coach humain » | Ouverte (produit/copywriting). L'auditabilité livrée fournit la matière factuelle. |
| 4. Processus de revue qualité du fondateur | Partiellement traitée : table `plan_reviews` + rôle `staff`. Fréquence et canal restent à définir. |
| 5. Réinitialisation du compteur d'accès | **Neutralisée techniquement** (ADR-008), décision produit à confirmer. |
| 6. Format / source d'un objectif « irréaliste » | **Toujours ouverte**. L'architecture retient un barème par discipline dans `rulesets.params` en V1 ; une approche statistique sur l'historique agrégé serait un changement de ruleset, pas de schéma. |
| 7. Sport rare / non documenté | **Traitée partiellement** : `sports.is_documented = false` ⇒ le moteur applique un profil générique prudent. Le comportement produit exact (refus vs plan prudent) reste à confirmer. |
| 8. Inactivité post-objectif | **Toujours ouverte** (produit). Le cron `objective_check` est en place, la politique de relance est à définir. |

### Questions ouvertes de la fiche US-02, statut après architecture

| Question fiche §7 | Statut |
|---|---|
| Format d'affichage du score (chiffre / courbe / décomposition) | **Ouverte (design)**. Le stockage sert déjà les trois formats (`hybrid_scores.by_day`, `by_discipline`, historique). `designer` tranche. |
| Fréquence de synchronisation | **Tranchée** : webhook temps réel + réconciliation quotidienne + rattrapage de 90 jours à la connexion. ADR-013 §1. |
| Règle de priorité déclaré / connecté | **Tranchée** : le connecté est portant, le déclaré enrichit et n'est jamais supprimé ; fusion réversible. ADR-015 §2. |
| Sources candidates au-delà de Strava | **Toujours ouverte** (produit). `data_providers` + `external_sport_mappings` rendent l'ajout d'une source non structurant. |
| Seuil de calibration du score | **Tranchée** : paramètre propre, initialisé à 4 semaines comme la F1, plus un plancher de 4 séances. ADR-014 §4. |
| Consentement dédié aux données importées | **Tranchée : oui.** Nouveau document `third_party_data_import`, verrouillé par trigger y compris pour le `service_role`. ADR-013 §5. |

### Questions ouvertes de la fiche US-03, statut après architecture

| Question fiche §7 | Statut |
|---|---|
| Granularité de l'horaire précis | **Tranchée** (question technique, explicitement déléguée à `architect`) : sous-créneaux fixes sur une grille de 30 min, bornes et préférences au ruleset. ADR-016 §4. |
| Fréquence / limite du signalement d'imprévu | **Toujours ouverte — volontairement non tranchée** (question **produit**). Le support technique est prêt : `schedule_incidents` est un journal daté indexé, et `planning.incident_soft_limit_per_week` existe au ruleset avec la valeur `null` = *aucune limite appliquée*. Le design a déjà spécifié l'état `disabled` du bouton pour l'accueillir. Voir question 16. |

### Questions ouvertes ajoutées par `architect`

1. **Prix de l'abonnement — non fixé.** Les maquettes affichent **19 €/mois, placeholder posé par `designer`**, sans fondement produit. À trancher : montant, périodicité (mensuel seul ? annuel ?), essai gratuit, TVA. Aucun montant n'est écrit dans le code (ADR-009).
2. **Champ `pain_at_rest` manquant dans les maquettes.** L'AC9 niveau 3 distingue une douleur présente « à l'effort **ET** au repos ». La fiche §4 décrit une saisie douleur à 3 niveaux + localisation, sans ce booléen. Sans lui, le niveau 3 est indétectable. → **retour vers `designer` et `spec-writer`** pour ajouter une question conditionnelle (affichée uniquement si `pain = 'pain'`), ce qui préserve la contrainte « formulaire rapide ».
3. **Mineur** : refus d'inscription (recommandé) ou parcours dégradé ? Non tranché (ADR-010).
4. **Mode dégradé après retrait du consentement santé** : parcours non spécifié par les 14 AC — toujours à formaliser avec `spec-writer` en tant que parcours produit à part entière (ADR-010, « Conséquences »), mais **implémenté** depuis la revue de fin de projet (finding B1) : `POST /api/v1/consents/:code/revoke` insère une nouvelle ligne `granted = false` (jamais un `UPDATE`), purge `session_logs`/`nutrition_checkins`/`body_metrics`/`pain_episodes`, et le blocage est explicité côté UI par `DegradedModeBanner` (`/dashboard`, `/aujourdhui`, `/compte`) plutôt que subi silencieusement. Le retrait ferme aussi la **modification** des données de santé existantes (ADR-012 §2). **Précision post-contre-revue (interaction B1 × B6)** : les `risk_flags` de type `pathology`/`minor` ne sont **plus** purgés au retrait — ils portent l'avertissement médical fixe de l'AC3, qui doit survivre pour un utilisateur qui garde l'usage de son plan déjà généré ; seuls `pregnancy`/`eating_disorder_history`/`other` le sont toujours (`purge-health-data-on-revoke.ts`). Le document `health_data_processing` a été mis à jour en conséquence (version `1.1.0`, voir point 10 ci-dessous et ADR-010 §10) : la base légale précise de cette conservation partielle **reste une question ouverte pour le conseil juridique**, explicitée comme telle dans le texte lui-même plutôt que masquée par une citation d'article RGPD approximative.
5. ~~**Fournisseur LLM** : à choisir avec contrainte UE + DPA + non-entraînement (ADR-010).~~ **Tranché le 2026-08-06 : Mistral AI** (voir ADR-010, mise à jour). Impacte le budget par onboarding, à chiffrer par `devops`.
6. **Plan Vercel Pro requis** pour la planification du rituel dominical (ADR-011) — **budget pas encore validé par le fondateur (2026-08-06)**, non bloquant pour démarrer le développement, à trancher avant la mise en production du rituel hebdomadaire (lot L5). **Précision (2026-08-12, US-03)** : l'US-03 ajoute une seconde dépendance au cron **horaire** (`/cron/enqueue-schedule-closeouts`, ADR-017 §1). Le sujet reste non bloquant pour développer, mais il n'est plus isolé au seul rituel dominical.
7. ~~**Écran « Connexion données »** (n°3 du flow) : il appartient à la Feature 2 mais est **positionné dans le funnel d'onboarding** de la F1 (`04-flow.md`).~~ **Résolu (2026-08-06)** : retiré du funnel V1 — l'onboarding route directement vers le Dashboard. Voir `04-flow.md`, révision du 2026-08-06. **Repris par l'US-02** : point d'entrée Dashboard (invitation non bloquante) + Compte/Profil (permanent), AC1 de la fiche US-02.
8. **Conservation du registre de consentement après suppression de compte** (2026-08-07). L'architecture décide de le conserver, pseudonymisé, comme preuve du consentement recueilli (ADR-010 §8). **Tranché par le fondateur (2026-08-09) : 5 ans** à compter du dernier événement de consentement (voir ADR-010, question ouverte n°4). **Toujours ouvert** : le job de purge programmée à cette échéance n'est **pas implémenté** (confirmé à la contre-revue de fin de projet, finding I3 « partiel ») — le registre grossit sans purge automatique. Non bloquant pour le développement, bloquant pour l'ouverture commerciale.
9. **Rétention de `stripe_events`** (2026-08-07). **Résolu (2026-08-09, correction I3)** : rétention tranchée à 60 jours (au-delà de l'idempotence webhook et de la fenêtre de nouvelle tentative Stripe), purgée par `purge_stale_stripe_events()` (`0013_billing_robustness.sql`) via le cron quotidien `/cron/purge-stripe-events` (§6.8).
10. **Contenu juridique des `consent_documents` (`medical_disclaimer`, `health_data_processing`, `terms`, `privacy`) provisoire, non validé juridiquement** — ajouté suite à l'audit `code-reviewer` du Lot L1 (finding B3, 2026-08-07/09). Le texte inséré en `0010_seed_referentials.sql` porte explicitement la mention « Contenu provisoire — à faire valider juridiquement avant mise en production » dans son propre corps ; il est inséré avec `is_current = false` (hors production, `supabase/seed.sql` active la version provisoire pour débloquer développement et tests — ADR-010 §9) pour qu'aucun environnement ne le serve par défaut comme document en vigueur. **Mise à jour (2026-08-11)** : une nouvelle version `1.1.0` de `health_data_processing` a été ajoutée (`0014_health_data_processing_consent_v1_1_0.sql`, ADR-010 §10), pour rester cohérente avec la conservation partielle des `risk_flags` de sécurité décrite au point 4 — la version `1.0.0` promettait à tort une purge totale au retrait. `1.1.0` reste, comme `1.0.0` avant elle, un texte non validé juridiquement (`is_current = false` partout tant que la migration d'activation n'est pas publiée) ; elle **n'exige aucun re-consentement** (`has_active_consent()` ne teste que `document_code`, jamais `document_version`). **Mise à jour (2026-08-12, US-02)** : un **cinquième** document, `third_party_data_import` (`1.0.0`), rejoint la liste, avec le même régime provisoire et le même verrou de production. **Action requise avant mise en production** : (a) faire valider juridiquement les textes (en particulier `health_data_processing`, à la fois pour la base légale RGPD art. 9 du traitement de données de santé et pour la base légale — non tranchée — de la conservation ciblée des indicateurs `pathology`/`minor` au retrait de ce seul consentement, et `third_party_data_import` pour l'import depuis un sous-traitant tiers) ; (b) une fois validés, publier une migration dédiée qui insère la version validée (nouveau `version`) avec `is_current = true` — ne jamais faire passer `is_current` à `true` sur un contenu provisoire par un simple `UPDATE`. Propriétaire : fondateur (validation juridique) + `architect` (migration d'activation).
11. **Angle mort résiduel sur le plafond de progression de charge inter-version** (2026-08-11, constat de la contre-revue de fin de projet, finding B2). La régression mesurée (jusqu'à +165 % de volume d'entraînement en une seule révision hebdomadaire) a été corrigée : `computeWeeklyLoadTarget` (étape 6, `packages/rules-engine/src/pipeline/06-compute-weekly-load-target.ts`) borne désormais toute hausse par `weekly_load_progression_cap_pct` par rapport à `context.previousPlan` (même `weekStart`), en plus du plafond intra-draft déjà appliqué par `applyHardGuardrails` (étape 11). Un test de non-régression dédié (`load-progression-cap-across-versions.test.ts`) couvre les deux scénarios chiffrés par la contre-revue. **Reste un angle mort non couvert** : ce plafond compare `before` à la semaine de même `weekStart` dans `context.previousPlan.weeks` — si une semaine du nouveau plan **n'a pas d'équivalent** dans le snapshot précédent (`before === null`, hors de l'horizon détaillé/intention de la version précédente, ADR-004), `direction` est forcée à `'neutral'` et **aucun plafond inter-version ne s'applique** à cette semaine précise, faute de valeur de référence. Ce cas n'est aujourd'hui ni testé ni chiffré. À trancher avant la mise en production : soit documenter ce cas comme acceptable (une semaine hors snapshot n'a par construction jamais été montrée à l'utilisateur, donc rien à protéger d'une hausse perçue), soit ajouter une borne de repli (ex. par rapport à la moyenne des dernières semaines réellement montrées).
12. **Strava est un sous-traitant hors UE** (2026-08-12, US-02). Toute la contrainte de localisation d'ADR-010 §5 a été tenue jusqu'ici (Supabase UE, Vercel `cdg1`/`fra1`, Brevo, Mistral). L'import Strava introduit le premier **transfert international** du produit : nos serveurs interrogent une API états-unienne et en reçoivent des données personnelles d'entraînement. Le sens du flux est en notre faveur (nous ne *transmettons* pas de données de santé à Strava, nous en recevons), mais la question du cadre de transfert (clauses contractuelles types, adhésion au Data Privacy Framework, mentions dans la politique de confidentialité et le registre des traitements) **n'est pas tranchée**. Non bloquant pour le développement, **bloquant pour l'ouverture commerciale**. Propriétaire : fondateur + conseil juridique.
13. **Écran « Détail par source » non maquetté** (2026-08-12, US-02). L'AC6 exige que « l'origine de chaque donnée reste identifiable si Thomas veut vérifier le détail », et le design pose le lien « Détail → » sur la carte du Dashboard sans définir l'écran cible (`09-design-feature2-notes.md` §7, écart 5). Le contrat d'API existe (§13.3, `GET /data/activities`) ; l'écran reste à concevoir. Sans lui, le lien est un cul-de-sac. Propriétaire : `designer`.
14. **Point d'entrée « séance hors plan » non maquetté** (2026-08-12, US-02). L'AC3 promet que l'utilisateur n'est jamais bloqué faute d'intégration pour son sport, et le design route « Saisir manuellement » vers l'écran Séance du jour — lequel ne sait aujourd'hui que rendre compte de la séance **prévue** (ADR-015 §5). Il manque une affordance « enregistrer une séance non prévue » (discipline, type, durée, heure). Propriétaire : `designer`.
15. **Nommage « Profil » / « Compte »** (2026-08-12, US-02). Le design place le point d'entrée permanent de l'écran Connexion données dans un onglet **« Profil »** (`09-design-feature2-notes.md` §1.2) ; l'application implémente `/compte` (« Mon compte »). Divergence de vocabulaire, sans conséquence technique, à trancher avec `designer` avant l'implémentation de l'US-02 pour ne pas figer deux mots pour un même écran.
16. **Fréquence / limite du signalement d'imprévu — non tranchée** (2026-08-12, US-03). La fiche §7 la laisse ouverte et `architect` **refuse de la trancher** : c'est une décision produit, pas technique. Deux options se présentent, toutes deux implémentables sans migration : (a) plafond dur par semaine (`planning.incident_soft_limit_per_week`), le bouton passant en `disabled` — état déjà spécifié par le design §1.7 ; (b) aucun plafond, mais le nombre de signalements remonté au coach comme **indicateur d'inobservance** en révision hebdomadaire (diagnostic `nonadherence` de l'AC6 F1). L'option (b) est la plus cohérente avec le ton du produit (« le coach n'interrompt pas ») mais demande un texte de restitution qui n'existe pas. **Tant que rien n'est tranché, le signalement est illimité.** Propriétaire : fondateur.
17. ~~**Le `not_done` automatique n'est montré nulle part, ni corrigeable dans l'UI**~~ (2026-08-12, US-03). **Résolu le 2026-08-12.** Design : `11-design-notes.md` §3 — carte `D-notdone-notice` sur le Dashboard (fenêtre 48 h, deux actions symétriques « Je l'ai faite quand même » / « C'est exact »), état (d) « Non réalisée » sur le Planning semaine, parcours de correction en variante de `MqvfH` (`/aujourdhui?log=<id>`) sans écran nouveau. Technique : **amendement ADR-017 §8-§9**, §14.5 et §14.7 ci-dessous, `docs/db-schema.md` §11.8 — le discriminant « automatique vs déclaré » est le lien de retour **déjà existant** `schedule_incidents.resulting_session_log_id`, et l'acquittement est une colonne `acknowledged_at` sur cette même table, écrite par l'utilisateur via un GRANT colonne (patron `plan_diffs`). **`session_logs` reste inchangée.** *Reste à faire* : `spec-writer` inscrit ce parcours dans la fiche US-03 §4 — il n'est aujourd'hui porté que par les notes de design.
18. **État « annulée » sans horaire d'origine — non maquetté** (2026-08-12, US-03). Le design §1.6 rend l'état (c) avec le motif `mar. 18h30 → Annulée`, qui suppose un horaire d'origine. Or l'AC1 prévoit aussi le cas d'une séance **jamais placée** (aucun créneau disponible dès le placement initial) : il n'y a alors **pas** d'heure d'origine à afficher. Rendu attendu : `Mardi → Annulée`, sans heure. À confirmer par `designer`. Propriétaire : `designer`.
19. **Le moteur ignore `slot` et `max_minutes`** (2026-08-12, US-03). `09-build-sessions.ts` ne lit que `weekday` sur les créneaux disponibles et écrit `slot: 'unspecified'` en dur : le moteur peut poser une séance de 90 min sur un jour dont le seul créneau déclaré en porte 45. La F3 rattrape en aval (annulation explicite, AC4), mais l'utilisateur pourra juger l'annulation arbitraire. Faire consommer la capacité déclarée par l'étape 9 est une décision de **contenu**, donc F1 : hors périmètre US-03, à arbitrer avec `spec-writer`. Propriétaire : `spec-writer` + `architect`.
20. **Aucune tab bar dans le code, contrairement à ce que suppose le design F3** (2026-08-12, US-03). Le design F3 constate une tab bar à 4 items (`Aujourd'hui · Séance · Planning · Profil`) sur la maquette du Dashboard et en déduit qu'aucun bouton retour n'est nécessaire sur `/planning` (`10-design-feature3-notes.md` §1.1). **Cette tab bar n'existe pas en code** (`app/(app)/layout.tsx` ne rend qu'un conteneur ; la navigation passe par des liens). Se cumule avec la divergence de nommage « Profil » / « Compte » déjà relevée au point 15. À trancher avec `designer` **avant** l'implémentation de `/planning`, faute de quoi l'écran sera livré sans moyen d'y accéder ni d'en revenir. Propriétaire : `designer`.

---

## 13. Feature 2 — centralisation des données et score hybride

> Ajouté le **2026-08-12**. Fiche de référence : `09-spec-feature2-centralisation-donnees.md` (fait foi).
> Décisions : **ADR-013** (synchronisation Strava), **ADR-014** (score hybride), **ADR-015** (réconciliation).
> Schéma : `docs/db-schema.md` **§10**. Plan d'implémentation : `plans/US-02-centralisation-donnees.md`.

### 13.1 Principe directeur

L'US-02 est une feature d'**enrichissement**. La règle non négociable héritée de la F1 (AC12, réaffirmée en AC9 de l'US-02) se traduit par un invariant vérifiable :

> **Aucun chemin de code du coach IA ne doit interroger `data_connections`, `sync_runs` ou `hybrid_scores`.**

Concrètement : `buildPlanningContext()` lit du **réalisé** (`session_logs`, `body_metrics`), jamais une connexion ; `generatePlan()` ne reçoit pas de score ; l'absence totale de source connectée produit exactement le comportement F1 d'aujourd'hui. Un test d'architecture (`no-connection-dependency.test.ts`) fige cet invariant, sur le modèle du test de frontière `coach-llm` ↛ `rules-engine` d'ADR-003.

### 13.2 Écrans et composants

| Écran | Route | Nature |
|---|---|---|
| Dashboard (évolution) | `/dashboard` | Ajout de la carte d'invitation (`D-connect-invite`, visible en régime `cold` uniquement) et de la carte « Mes données » (`D-data-card`) — **cette carte n'existe pas encore en code**, seulement dans la maquette |
| Connexion données (nouveau) | `/donnees` | Sous-écran, pas de tab bar, `✕` de fermeture (patron `Yf6zY`) |
| Consentement import (nouveau) | `/donnees/consentement` | Écran bloquant **avant** le flux OAuth, patron de l'écran de consentement santé F1 |
| Score hybride (nouveau) | `/score` | Sous-écran, anneau 0-100, deux états : nominal et calibration |
| Compte (évolution) | `/compte` | Ligne permanente « Sources de données » (AC1) |
| Séance du jour (évolution) | `/aujourdhui` | Affordance « enregistrer une séance non prévue » (AC3 — §12, question 14) |

### 13.3 Contrats d'API (US-02)

| Route | Méthode | Auth | Sortie / effet |
|---|---|---|---|
| `/data/providers` | GET | authentifié | `DataSourcesView` — une entrée par `data_providers`, avec l'état de connexion de l'utilisateur (badges du design §3.3) |
| `/data/connections/:provider/authorize` | POST | authentifié + **consentement `third_party_data_import`** | `{ authorizeUrl, state }` — `403 CONSENT_REQUIRED` sinon, `503 CONSENT_DOCUMENT_UNAVAILABLE` si aucun texte en vigueur |
| `/data/connections/:provider/callback` | GET | authentifié (session) + `state` signé | Échange le code, chiffre et stocke les jetons, passe la connexion en `active`, enrôle `strava_backfill`, redirige vers `/donnees` |
| `/data/connections/:id` | DELETE | authentifié + propriétaire | Révoque chez le fournisseur, **supprime les jetons**, `status='revoked'`, recalcule `data_regime`. `{ status, retainedLogs }` — AC10 |
| `/data/activities?from&to` | GET | authentifié | `ActivityFeedItem[]` — provenance par élément (`synced`\|`declared`), fusions incluses. Sert le « Détail → » de l'AC6 (écran à maquetter, §12 q13) |
| `/data/overview` | GET | authentifié | `DataOverviewView` — les 4 cellules de `D-data-card`, leurs glyphes de provenance, le résumé de sources et l'état de synchronisation (AC6) |
| `/score/hybrid` | GET | authentifié | `HybridScoreResponse` — calcul paresseux, `no-store` |
| `/webhooks/strava/[pathSecret]` | GET | — | Validation de souscription : renvoie `{ "hub.challenge": … }` si `hub.verify_token` correspond |
| `/webhooks/strava/[pathSecret]` | POST | — (non signé, cf. ADR-013 §1) | Enrôle un job et répond `200` **en moins de 2 s**. Ne lit du payload que `object_id` / `aspect_type` / `owner_id` |
| `/cron/reconcile-data-sources` | GET, POST | `CRON_SECRET` | Filet de sécurité quotidien (§6.8) |
| `/session-logs/:id/unmerge` | POST | authentifié + propriétaire | Annule une fusion (AC5) |

```ts
// GET /api/v1/score/hybrid — AC7, AC8, AC9
type HybridScoreResponse =
  | { status: 'calibration';                         // AC8 — sortie NOMINALE
      weeksAvailable: number; weeksRequired: number;
      sessionsCounted: number; sessionsRequired: number;
      message: string;
      volume: VolumeView; split: SplitView | null;   // les données brutes restent servies
      nextStep: { kind: 'connect_sources' | 'log_session'; label: string }; }
  | { status: 'available';
      score: number;                                  // 0-100
      delta: { value: number; since: string } | null; // recalculé à J-7, jamais relu
      components: { volume: Component; consistency: Component; diversity: Component };
      basis: { sessions: number; disciplines: number; windowDays: number };
      volume: VolumeView;                             // S-volume-card : 7 jours + barres
      split: SplitView;                               // S-split-card : parts par discipline
      provenance: { connected: number; declared: number };
      explanation: { short: string; explanationId: string } | null;
      rulesetVersion: string; };

type Component = { normalized: number; weight: number; raw: number; label: string };
```

```ts
// GET /api/v1/data/overview — AC6
type DataOverviewView = {
  regime: 'cold' | 'declared' | 'connected';
  sourcesSummary: string | null;                     // « 3 sources · Strava, muscu, nutrition »
  cells: Array<{
    key: 'load' | 'recovery' | 'sleep' | 'resting_hr';
    value: string | null;                            // null ⇒ « — » (régime froid)
    label: string; trend: string | null; tone: 'info' | 'success' | 'neutral';
    provenance: 'synced' | 'declared' | 'mixed' | null;   // glyphes ↻ / ✎ du design §2.2
  }>;
  sync: { status: 'idle' | 'running' | 'failed'; lastSyncedAt: string | null;
          errorMessage: string | null } | null;      // état « SYNCHRONISATION EN ÉCHEC », design §2.6
  hybridScore: { status: 'calibration' | 'available'; score: number | null };
};
```

### 13.4 Flux de synchronisation

```
CONNEXION
  /donnees ──► consentement `third_party_data_import` ──► POST /data/connections/strava/authorize
        │                                                        │ state signé (HMAC)
        │                                                        ▼
        │                                            Strava — écran d'autorisation
        │                                                        │
        └──────────── GET /callback ◄────────────────────────────┘
                          │ échange du code, chiffrement des jetons, status='active'
                          ▼
                job_queue 'strava_backfill:{connection}'   (90 jours, pages de 30)

TEMPS RÉEL
  Strava ──► POST /webhooks/strava/[secret] ──► job_queue 'strava_activity_sync:{objectId}:{eventTime}'
                     │ < 2 s, aucun appel réseau            │
                     └── 200 ◄──────────────────────────────┘
                                     drain-jobs (5 min) ────► syncDataConnection()
                                                                │ re-fetch de l'activité (jamais le payload)
                                                                ├─ import minimisé (ADR-013 §4)
                                                                ├─ computeLoadUnits() → session_logs.load_units
                                                                ├─ reconcileSessionLogs()  → AC5
                                                                ├─ sync_runs (succès/échec, quotas)
                                                                └─ recompute hybrid_scores → AC7

FILET
  cron quotidien ──► /cron/reconcile-data-sources ──► job_queue 'strava_reconcile:{connection}:{date}'
                                                        (fenêtre glissante de 7 jours)
```

Trois propriétés portées par la file existante (ADR-011), sans code nouveau : idempotence par clé métier (`idempotency_key` unique), reprise après échec (`SKIP LOCKED`, `attempts`, back-off), et visibilité des échecs (`abandoned` + alerte).

### 13.5 Régime de données (`data_regime`)

Recalculé côté serveur — jamais par le client — par `refreshDataRegime(userId)`, appelé après une connexion, une déconnexion, un retrait de consentement et le premier log :

```
'connected'  s'il existe au moins une `data_connections` en statut `active`
'declared'   sinon, s'il existe au moins une donnée réalisée (session_logs / body_metrics / nutrition_checkins)
'cold'       sinon
```

C'est cette valeur qui pilote l'affichage de la carte d'invitation du Dashboard (design §1.1 : rendue en `cold` uniquement) et qui alimente `PlanningContext.dataRegime`, déjà lu par le moteur depuis la F1.

### 13.6 Ce que l'US-02 change dans le code F1

Quatre points de contact, tous additifs, à traiter avec des tests de non-régression :

1. `apply-daily-log.ts` — après l'insertion, appel de `finalizeSessionLogLoad()` (charge réalisée, `service_role`) puis de `reconcileSessionLogs()` (AC5) et du recalcul de score. L'ajustement de plan synchrone de l'AC4 est **inchangé**.
2. `build-planning-context.ts` — `actualLoadUnits` cesse d'être `null` en dur (lecture de `session_logs.load_units`), et la lecture des logs filtre `excluded_at is null`. **Aucune règle du moteur ne lit `actualLoadUnits` aujourd'hui** : le changement est inerte à court terme, mais il devient une entrée réelle du moteur dès qu'une règle s'en servira.
3. `consents/[code]/revoke/route.ts` — branche `third_party_data_import` : révocation en cascade des connexions.
4. `dashboard/page.tsx` — ajout de deux cartes. Fichier également touché par la F3 (`D-planning-card`) : **risque de conflit à coordonner** (§13.8).

### 13.7 Couverture des 10 critères de l'US-02

| AC | Mécanisme technique principal | Où |
|---|---|---|
| AC1 — point d'entrée hors funnel | `data_regime = 'cold'` ⇒ carte d'invitation ; ligne permanente dans `/compte` | §13.2, §13.5 |
| AC2 — connexion Strava (OAuth) | `POST /data/connections/strava/authorize` + callback, `state` signé, jetons chiffrés hors table | ADR-013 §2, §13.3 |
| AC3 — saisie manuelle sans intégration | `CreateSessionLogInput` étendu (`sportCode`, `sessionType`, `startedAt`) ; nutrition inchangée | ADR-015 §5 |
| AC4 — synchronisation sans ressaisie | Webhook + réconciliation quotidienne + rattrapage 90 j ; `source = 'connected'` posé serveur | ADR-013 §1, §13.4 |
| AC5 — résolution de doublon | `reconcileSessionLogs()` ; `excluded_at` / `superseded_by_log_id` / `match_evidence` ; fusion réversible | ADR-015 §2-§3 |
| AC6 — tableau de bord centralisé | `GET /data/overview` ; provenance dérivée par cellule ; `GET /data/activities` pour le détail | §13.3 |
| AC7 — score hybride | `computeHybridScore()` pur + `rulesets.params.hybrid_score` + `hybrid_scores` | ADR-014 |
| AC8 — calibration du score | `status = 'calibration'`, `score = null` garanti par CHECK en base | ADR-014 §4, `db-schema.md` §10.7 |
| AC9 — jamais une condition de fonctionnement | Invariant §13.1 + test d'architecture dédié ; toutes les sorties dégradées sont nominales | §13.1 |
| AC10 — déconnexion | Révocation chez le fournisseur, suppression des jetons, données conservées, provenance dérivée | ADR-013 §6, ADR-015 §3 |

### 13.8 Points de contact laissés à la Feature 3 (Planning)

Aucune table n'est partagée entre l'US-02 et la F3, mais quatre fichiers et un référentiel le sont. À l'attention de l'architecte F3 :

1. **`session_logs.started_at`** (nouveau, US-02) porte l'**heure réelle** de début d'une séance. La F3 décide du *quand prévu* ; elle dispose désormais du *quand réel* pour mesurer l'écart, sans ajouter de colonne.
2. **`rulesets.params`** gagne une section `hybrid_score` et une version `0.2.0-dev`. Si la F3 ajoute ses propres paramètres, elle publie une **nouvelle version** (`0.3.0-dev`) qui reprend celle de l'US-02 — jamais une modification de `0.2.0-dev` (ADR-007 §1).
3. **`apps/web/lib/jobs/drain.ts`** — le dispatcher par `kind` est un fichier partagé. L'US-02 y ajoute trois branches ; la F3 en ajoutera d'autres. Conflit de fusion probable, sans difficulté sémantique.
4. **`apps/web/app/(app)/dashboard/page.tsx`** — l'US-02 y insère deux cartes entre la carte Nutrition et le bas de page ; la F3 y insère `D-planning-card`. L'ordre éditorial du Dashboard (plan du jour en premier, `07-spec-feature1-coach-ia.md` §6) est une contrainte commune : à arbitrer ensemble plutôt que par ordre d'arrivée.
5. **`planned_sessions` n'est pas touchée par l'US-02** — la F3 hérite de la table telle que la F1 l'a laissée.

> **Réponses de l'architecte F3 (2026-08-12).** Les cinq points ci-dessus ont été traités :
>
> 1. **`session_logs.started_at`** — aucune colonne symétrique n'est ajoutée à `planned_sessions`. L'heure **prévue** vit dans `session_placements.scheduled_time` (table F3 dédiée, ADR-016 §1) ; l'écart prévu / réel se lit donc par jointure entre les deux, sans redondance et sans altérer une table de la F1 ou de la F2.
> 2. **`rulesets.params`** — la F3 publie `0.3.0-dev`, qui **reprend intégralement** `0.2.0-dev` (section `hybrid_score` comprise) et y ajoute une section `planning` de 13 paramètres. `0.2.0-dev` n'est ni modifiée ni supprimée (ADR-007 §1).
> 3. **`lib/jobs/drain.ts`** — la F3 y ajoute deux branches (`refresh_placements`, `schedule_closeout`). Conflit de fusion mécanique confirmé, aucune difficulté sémantique. Signalé à son tour au prochain arrivant (§14.10).
> 4. **`dashboard/page.tsx`** — **ordre éditorial arrêté en §14.4** : plan du jour, puis `D-planning-card`, puis les deux cartes de l'US-02, puis le bas de page inchangé. Le lot qui fusionne en second insère ses cartes autour de celles déjà présentes, sans les déplacer.
> 5. **`planned_sessions`** — la F3 ne la touche pas non plus. Elle reste **exactement** dans l'état où la F1 l'a laissée.

---

## 14. Feature 3 — planning selon emploi du temps

> Ajouté le **2026-08-12**. Fiche de référence : `10-spec-feature3-planning-emploi-du-temps.md` (fait foi).
> Design : `10-design-feature3-notes.md` (spec écrite de substitution — rien n'a été écrit dans Pencil, voir §14.9).
> Décisions : **ADR-016** (placement horaire dérivé, imprévu = indisponibilité datée, granularité), **ADR-017** (clôture d'imprévu → `session_log` `not_done`).
> Schéma : `docs/db-schema.md` **§11**. Plan d'implémentation : `plans/US-03-planning-emploi-du-temps.md`.

### 14.1 Principe directeur

La F1 avait posé la frontière (§11) : **F1 décide QUOI et COMBIEN, F3 décide QUAND.** L'US-03 la transforme en invariant vérifiable :

> **Aucun chemin de code de la F3 n'écrit dans une table du moteur, et aucune sortie de la F3 ne porte un champ de contenu de séance.**

Concrètement : `planned_sessions` n'est ni altérée ni écrite (ADR-016 §1) ; le replacement ne crée **aucune** `plan_versions`, donc aucun diff, aucun invariant d'asymétrie, aucun rendu LLM ; et le type de sortie de l'algorithme de placement ne comporte ni durée, ni charge, ni type de séance, ni prescription — **l'AC3 (« le contenu reste strictement inchangé ») est une propriété de type, pas une vigilance de relecture** (ADR-016 §5).

Deux tests d'architecture figent cet invariant, sur le modèle de `no-connection-dependency.test.ts` (US-02) et du test de frontière `coach-llm` ↛ `rules-engine` (ADR-003) :

- `placement-never-writes-plan-tables.test.ts` — aucun module de `lib/planning/**` n'importe `materializePlanVersion` ni `regeneratePlan` ;
- `placement-output-has-no-content.test.ts` — le type `PlacementDecision` ne porte aucune clé de contenu (test de type + assertion runtime sur les clés retournées).

### 14.2 Le modèle en trois objets

| Objet | Table | Nature | Durée de vie |
|---|---|---|---|
| **L'intention du moteur** | `planned_sessions.scheduled_date` + `slot` | décidée par la F1 | celle de sa `plan_version` |
| **Le placement effectif** | `session_placements` (date effective + heure) | **dérivé**, matérialisé, append-only avec supersession | celle de sa `plan_version` |
| **L'imprévu** | `schedule_incidents` (indisponibilité datée) | fait **utilisateur**, append-only | permanente — survit à toutes les régénérations |

```
placement = f( planned_sessions de la version active,
               availability_slots,          ← F1, jamais modifiée par la F3
               schedule_incidents,          ← F3, permanent
               ruleset.params.planning )    ← 0.3.0-dev
```

`f` est pure et déterministe. Le résultat est **matérialisé** pour la même raison qu'ADR-005 §4 matérialise le diff : un placement recalculé à chaque affichage dériverait, et le message annoncé en `aria-live` (« Séance déplacée à jeudi 7 h 00 ») doit dire la même chose dix minutes plus tard.

**Chemin d'écriture unique** : `materializeSessionPlacements()`, appelée depuis exactement trois endroits — `regeneratePlan()` (dans la même transaction, après `materializePlanVersion`), `resolveScheduleIncident()`, et le job `refresh_placements`. Aucun autre. Même règle, et même vérifiabilité par `grep`, que `materializePlanVersion()` (ADR-004 §2) et `finalizeSessionLogLoad()` (ADR-015 §1).

### 14.3 Écrans et composants

| Écran | Route | Nature |
|---|---|---|
| Planning semaine (nouveau) | `/planning` | Écran **premium** (AC6, hérité d'AC13 F1). 7 groupes-jour, 3 états de carte séance, bouton « Signaler un imprévu » par séance |
| Dashboard (évolution) | `/dashboard` | `D-planning-card` = `weekly-preview-card.tsx` **enrichi** : colonne heure, badges `DÉPLACÉE` / `ANNULÉE`, lien vers `/planning` |
| Séance du jour (évolution) | `/aujourdhui` | Heure de la séance + bouton « Signaler un imprévu » — **accessible en accès libre** (AC6) |

**Le bloc verrouillé du Dashboard (`R8syr`/`LBMdV`) reste inchangé et ne laisse fuiter ni heure, ni état d'imprévu** (design §2.4) : un utilisateur libre ne reçoit toujours pas la semaine dans le payload (§3.3, ADR-008 §4).

### 14.4 Coordination du Dashboard avec l'US-02 — **ordre éditorial arrêté**

`apps/web/app/(app)/dashboard/page.tsx` est touché par l'US-02 (deux cartes) et par l'US-03 (`D-planning-card`). Le point de contact §13.8 n°4 demandait un arbitrage plutôt qu'un ordre d'arrivée. **Arbitrage rendu, à honorer par celui des deux lots qui fusionne en second :**

```
1. Bandeaux de sécurité        PainReferralNotice · MedicalClearanceNotice · DegradedModeBanner   (F1, inchangé)
2. CoachPlanCard               plan du jour — séance + nutrition                                  (F1, inchangé)
3. D-planning-card             aperçu glissant J → J+7, AVEC heures et états d'imprévu            (F3)  ← ici
4. D-connect-invite            invitation « connecte tes données », régime `cold` uniquement      (F2)
5. D-data-card                 « Mes données » + ligne score hybride                              (F2)
6. WeeklyReviewBadge · FreeAccessMeter · UpsellBanner                                             (F1, inchangé)
```

Trois raisons, dans cet ordre :

1. **Le plan du jour reste premier et mis en avant** — contrainte non négociable de `07-spec-feature1-coach-ia.md` §6, déjà appliquée en code (`CoachPlanCard`, bordure accent).
2. **`D-planning-card` suit immédiatement**, parce que c'est **le même objet à une autre échelle** : la séance du jour puis la semaine qui la contient. Les insérer les deux d'affilée préserve la lecture « voici ton plan », et c'est déjà la position qu'occupe `weekly-preview-card.tsx` en code aujourd'hui — l'US-03 ne déplace donc rien, elle enrichit une carte en place.
3. **Les deux cartes F2 viennent ensuite**, parce que l'US-02 se définit elle-même comme une **couche d'enrichissement** (§13.1) : elle documente et enrichit le plan, elle ne le précède pas. `D-connect-invite` avant `D-data-card` car l'invitation ne s'affiche qu'en régime `cold`, c'est-à-dire quand `D-data-card` est vide de valeurs.

Ce que cela implique concrètement : **le lot qui fusionne en second insère ses cartes autour de celles déjà présentes, sans les déplacer.** Le conflit de fusion est mécanique, jamais sémantique.

### 14.5 Contrats d'API (US-03)

| Route | Méthode | Droit | Sortie / effet |
|---|---|---|---|
| `/plan/week?weekStart=` | GET | **premium** | `WeekPlanResponse` **étendu** — `days[].sessions[]` (pluriel) et `placement` par séance. `402 PAYWALL_REQUIRED` sinon |
| `/plan/today` | GET | libre (quota) | `TodayPlanResponse` — `session.placement` ajouté (heure du jour + droit de signalement) |
| `/schedule/incidents` | POST | authentifié — **hors quota, libre comme premium** | `ReportIncidentResponse`. Résout le replacement **de façon synchrone** |
| `/schedule/incidents/:id/acknowledge` | POST | authentifié + propriétaire — **hors quota, libre comme premium** | `{ acknowledgedAt }` — n'écrit **que** `acknowledged_at` (ADR-017 §9). Pendant exact de `/plan/reviews/:diffId/acknowledge` (§6.3) |
| `/cron/enqueue-schedule-closeouts` | GET, POST | `CRON_SECRET` | Enrôle les clôtures d'imprévu (ADR-017 §1), horaire |

**Aucune route de lecture nouvelle.** L'écran `/planning` lit par `fetchWeekPlan()` côté serveur, exactement comme le Dashboard : l'AC5 exige « même semaine, mêmes placements, pas de double source de vérité », une seconde route l'aurait ouvertement contredit.

```ts
// Vue de placement — attachée à chaque séance servie (jour ou semaine)
type SessionPlacementView = {
  status: 'scheduled' | 'moved' | 'cancelled_week';
  scheduledDate: string | null;      // date EFFECTIVE ; null ⟺ cancelled_week
  scheduledTime: string | null;      // 'HH:MM' ; null ⟺ cancelled_week
  origin: { date: string; time: string | null } | null;   // motif « ancien → nouveau », design §1.5
  reason: 'initial' | 'plan_regenerated' | 'availability_changed'
        | 'incident_reported' | 'no_slot_available';
  note: string | null;               // « Déplacée suite à un imprévu signalé. » — le « pourquoi » d'AC3
  canReportIncident: boolean;        // false si passée, annulée, ou hors fenêtre de préavis
};
```

```ts
// POST /api/v1/schedule/incidents — AC3, AC4, AC6
type ReportIncidentInput = { plannedSessionId: string };   // RIEN d'autre : décision du fondateur
                                                           // du 2026-08-11 (bouton, pas formulaire)

type ReportIncidentResponse = {
  incidentId: string;
  outcome: 'rescheduled' | 'cancelled_week';
  placement: SessionPlacementView;   // l'état d'arrivée de la carte — la réponse EST le retour UI
  message: string;                   // annoncé en `aria-live="polite"`, jamais un toast (design §1.7)
};
```

Points de contrat qui ne se devinent pas :

- **`cancelled_week` est une sortie nominale, pas une erreur** (`200`, jamais `4xx`). Même doctrine que `status: 'calibration'` (AC7) et que la sortie de calibration du score (US-02) : une impossibilité expliquée n'est pas une panne.
- **Idempotence** : un second appel sur la même séance renvoie **la même résolution** avec `200`, garanti par l'index unique `schedule_incidents_one_per_placement` (double appui). Aucun second créneau n'est bloqué.
- **`409 SESSION_NOT_REPORTABLE`** quand la séance est passée, déjà annulée, ou à moins de `planning.min_lead_time_min` de l'instant courant — l'état `disabled` du bouton (design §1.7) a son pendant serveur.
- **`500 PLACEMENT_FAILED`** est réservé à l'échec **technique** du calcul : c'est le seul cas qui déclenche le message rouge du design §1.7. Une absence de créneau n'est pas un échec technique.
- **Ne consomme jamais d'accès libre** — ADR-008 §5 est étendu : le signalement rejoint la saisie quotidienne et les écrans de sécurité dans la liste de ce qui n'est ni compté ni bloqué. Gérer un imprévu n'est pas du contenu premium ; **seule la vue semaine complète l'est** (AC6).

#### Restitution du `not_done` automatique — `D-notdone-notice` (amendement ADR-017 §8-§9)

**Aucune route de lecture nouvelle, là non plus.** La carte est rendue par le Dashboard, qui est un
composant serveur : elle est alimentée par un lecteur `readNotDoneNotices(userId)`
(`apps/web/lib/planning/read-notdone-notices.ts`), au même titre que `fetchWeekPlan()`. Ajouter un
`GET` pour une carte de Dashboard dupliquerait une source de vérité pour rien (même motif qu'AC5).

```ts
// apps/web/lib/planning/read-notdone-notices.ts — lecture serveur, jamais exposée en HTTP
type NotDoneNoticeView = {
  incidentId: string;
  sessionLogId: string;                            // cible de « Je l'ai faite quand même » :
                                                   //   /aujourdhui?log=<id> (design §3.3)
  loggedDate: string;                              // 'YYYY-MM-DD' — « Mar. 3 août »
  sessionLabel: string | null;                     // « Seuil — 3 × 8 min » ; null si la séance
                                                   //   n'appartient plus à la version active
  resolution: 'rescheduled' | 'cancelled_week';    // pilote la 2e phrase du corps (design §3.1)
  closedOutAt: string;
};
// Retourne les notices ouvertes, les plus récentes d'abord. Le composant rend la PREMIÈRE et dérive
// « + N autre(s) séance(s) concernée(s) » de `length - 1` — jamais deux cartes empilées.
```

Quel champ lit-on, et pour quoi :

| Question de l'UI | Champ / prédicat |
|---|---|
| Ce `not_done` est-il **automatique** ? | `exists (select 1 from schedule_incidents i where i.resulting_session_log_id = l.id)` — ADR-017 §8. **Jamais** `not_done_reason`, texte libre réécrivable par l'utilisateur |
| La carte a-t-elle déjà été acquittée ? | `schedule_incidents.acknowledged_at is null` |
| L'utilisateur a-t-il corrigé entre-temps ? | `session_logs.completion = 'not_done'` dans la jointure — la carte disparaît **sans écriture supplémentaire** |
| Une synchronisation a-t-elle absorbé la séance ? | `session_logs.excluded_at is null` (ADR-015 §2) |
| Fenêtre de 48 h (design §3.1) | `closed_out_at >= now() - interval '48 hours'` — constante de **présentation**, pas paramètre de ruleset (`rulesets.params` porte les paramètres du moteur, ADR-007 §1) |

`POST /api/v1/schedule/incidents/:id/acknowledge` — « C'est exact » :

- **N'écrit rien dans `session_logs`.** Le `not_done` reste compté par la révision hebdomadaire (AC5)
  et `evaluateStagnation()` (AC6). Acquitter range la carte, pas la donnée — c'est toute la
  différence avec `PATCH /session-logs/:id`, qui reste le chemin de correction (design §3.3).
- **N'exige pas le consentement santé** : ce n'est pas une écriture de donnée de santé. Le design
  §3.2 masque de toute façon la carte en mode dégradé, la correction y étant impossible.
- **Idempotent** : un second appel renvoie l'horodatage déjà posé, en `200`.
- `404` si l'imprévu est inconnu ou n'appartient pas à l'appelant (jamais de divulgation d'existence) ;
  `409 VALIDATION_FAILED` si `closeout_outcome <> 'log_created'` — **aucun code d'erreur nouveau**,
  la contrainte `schedule_incidents_ack_requires_created_log` doublant le contrôle en base.
- **Ne consomme aucun accès libre**, même extension d'ADR-008 §5 que `POST /schedule/incidents`.

**Rupture de contrat assumée** : `WeekPlanDayView.session` (singulier) devient `sessions: TodaySessionView[]` (pluriel). Motif : le placement peut poser deux séances le même jour (le design le prévoit explicitement, §1.3 « gap entre deux séances d'un même jour »), ce que la forme actuelle rend inexprimable. `weekly-preview-card.tsx` et `read-plan-week-macro.ts` sont à adapter — changement interne, aucune API publique.

### 14.6 Algorithme de placement

Fonction **pure**, dans `@hybride/rules-engine`, **hors des 12 étapes du pipeline** et appelée par aucune d'elles — statut identique à `computeHybridScore()` (ADR-014 §6). Elle y vit malgré tout, plutôt que dans `apps/web`, pour une seule raison : elle doit revérifier des garde-fous de sécurité déjà implémentés (`guardrail-helpers.ts`), et les réimplémenter ailleurs dupliquerait de la logique de sécurité.

```
placeWeekSessions(input, ruleset) → { decisions[] }        // AUCUN champ de contenu en sortie

 1. buildCalendar       fenêtres [début, fin] par date, issues de `availability_slots` × `slot_windows` ;
                        capacité = `max_minutes` ?? `default_slot_capacity_min` ;
                        `is_available = false` ⇒ aucune fenêtre — AC1
 2. applyExceptions     retranche les fenêtres neutralisées par les imprévus du jour
                        (fenêtre occupée ± `incident_block_margin_min`) — AC3
 3. seedOccupancy       marque comme occupés les placements GELÉS : ceux déjà passés, et ceux que
                        l'imprévu courant n'invalide pas (recalcul LOCAL, ADR-016 §7)
 4. orderSessions       tri déterministe : (scheduled_date du moteur, order_in_day, id)
 5. pour chaque séance :
      a. candidats  = créneaux de la grille (`grid_minutes`) où la durée tient dans une fenêtre libre
      b. filtres de sécurité, réévalués à chaque candidat :
           · `max_consecutive_days_without_rest`                       AC8  (fenêtre débordant la semaine)
           · `min_hours_between_intense_and_strength_same_groups`      AC10 (mêmes groupes musculaires)
           · `max_sessions_per_day`, `min_minutes_between_sessions_same_day`,
             `allow_two_intense_sessions_same_day = false`
           · `min_lead_time_min` — jamais dans le passé, jamais « dans 10 minutes »
      c. tri des candidats : (1) même jour que l'intention du moteur — AC3 « un autre horaire le
         même jour » d'abord ; (2) écart de jours croissant, à l'intérieur de la SEMAINE ISO ;
         (3) rang dans `preferred_start_times` ; (4) heure croissante
      d. aucun candidat ⇒ `status = 'cancelled_week'`, `reason = 'no_slot_available'` — AC4
         sinon ⇒ `'scheduled'` si le placement coïncide avec l'intention du moteur, `'moved'` sinon
      e. marque l'occupation, passe à la séance suivante
```

Quatre propriétés à retenir :

- **Jamais au-delà de la semaine ISO** (`reschedule_scope = 'current_week'`) : c'est la traduction technique du refus de report cumulatif (AC4). Une séance qui ne rentre pas est annulée, jamais reportée.
- **Recalcul local, jamais réoptimisation globale** : un signalement ne fait bouger qu'une carte (ADR-016 §7). Une semaine qui se réorganise entièrement à chaque imprévu ferait perdre à Thomas la confiance dans un planning dont il vient précisément de déléguer l'arbitrage.
- **Les garde-fous sont revérifiés, jamais recalculés** : la F3 ne redéfinit aucun seuil, elle lit ceux du ruleset actif et refuse les candidats qui les violent (fiche §5, « F3 ne les recalcule pas, elle doit s'assurer que le nouveau placement ne les viole pas »).
- **Déterminisme total** : pas d'horloge interne, pas d'aléatoire, départages explicites. Testable en property-based, comme les garde-fous de l'AC8.

### 14.7 Clôture d'un imprévu (ADR-017)

```
Cron horaire ──► /cron/enqueue-schedule-closeouts
                     │  utilisateurs dont l'heure locale atteint `planning.closeout_local_hour` (03:00)
                     ▼
       job_queue  'schedule_closeout:{user}:{date locale J-1}'
                     │
        drain-jobs (5 min) ──► closeOutScheduleIncidents(user, localDate)
                                  │  date de clôture = date du placement COURANT portant l'imprévu,
                                  │                    sinon `reported_for_date`
                                  ├─ already_logged          → aucune écriture
                                  ├─ log_created             → session_log `not_done`, `load_units = 0`
                                  ├─ skipped_no_consent      → aucune écriture (consentement santé retiré)
                                  └─ skipped_session_absent  → aucune écriture (séance reprojetée)
```

Trois points structurants, détaillés en ADR-017 :

- **La clôture n'emprunte pas `applyDailyLog()`** : aucun ajustement de charge, aucune régénération, aucun `engine_runs`. La décision du fondateur (« événement temporel, jamais un ajustement de charge ») devient une propriété du chemin de code. La conséquence sur le plan existe malgré tout, mais **différée et passée par le moteur** : le log entre dans `buildPlanningContext().history` et donc dans la révision hebdomadaire (AC5) et `evaluateStagnation()` (AC6).
- **Le consentement santé est vérifié explicitement**, parce que le job écrit en `service_role` et contourne donc les policies d'ADR-010 §2 — exactement l'angle mort que l'US-02 avait dû fermer par trigger (ADR-013 §5).
- **Seuls les imprévus signalés sont clôturés.** Une séance non réalisée sans signalement ne produit toujours aucun log : la F3 ne change pas la doctrine F1 sur le silence de l'utilisateur.

**Ce que la clôture rend visible (amendement du 2026-08-12, ADR-017 §8-§9).** Un `not_done` écrit par
le serveur et jamais montré était l'angle mort n°1 d'ADR-017 (§12, question 17). Il est fermé sans
aucune table nouvelle et sans toucher `session_logs` :

```
closeOutScheduleIncidents()
      │  issue `log_created`
      ▼
schedule_incidents.resulting_session_log_id  ──►  DISCRIMINANT « automatique vs déclaré »
      │                                            (renseigné sur cette seule issue — ADR-017 §8)
      ▼
readNotDoneNotices(user)  ──►  D-notdone-notice (Dashboard, 48 h, design §3.1)
      │
      ├─ « Je l'ai faite quand même » ─► /aujourdhui?log=<id> ─► PATCH /session-logs/:id  (existant)
      │        └─ la carte disparaît par la jointure : completion <> 'not_done'
      │
      └─ « C'est exact » ────────────► POST /schedule/incidents/:id/acknowledge
               └─ écrit schedule_incidents.acknowledged_at, et RIEN d'autre.
                  Le `not_done` reste compté par AC5 et AC6 — c'est le sens de l'acquittement.
```

Le contrat de lecture et celui de la route sont en **§14.5** ; le schéma en `docs/db-schema.md`
**§11.8**. Un `not_done` saisi par l'utilisateur sur `MqvfH` n'est référencé par aucun imprévu :
la carte ne s'affiche jamais pour lui.

### 14.8 Ce que l'US-03 change dans le code F1 / F2

Cinq points de contact, tous additifs, tous à couvrir par des tests de non-régression :

1. `lib/orchestration/regenerate-plan.ts` — appel de `materializeSessionPlacements()` **dans la transaction**, après `materializePlanVersion()`. Le reste du squelette est inchangé.
2. `lib/orchestration/read-plan-week-macro.ts` et `read-today-plan.ts` — jointure sur le placement courant ; `days[].session` devient `days[].sessions[]` (§14.5).
3. `components/dashboard/weekly-preview-card.tsx` — colonne heure, badges, lien vers `/planning` (design §2.2, §2.3).
4. `lib/jobs/drain.ts` — deux branches (`refresh_placements`, `schedule_closeout`). **Fichier partagé avec l'US-02** : conflit de fusion attendu, sans difficulté sémantique (§14.10).
5. `app/(app)/dashboard/page.tsx` — position de `D-planning-card` arrêtée en §14.4.

**Aucune modification** de `packages/rules-engine/src/pipeline/**`, de `apply-daily-log.ts`, ni d'aucune table existante.

### 14.9 Couverture des 6 critères d'acceptation de l'US-03

| AC | Mécanisme technique principal | Où |
|---|---|---|
| AC1 — placement sans conflit avec les indisponibilités | `buildCalendar` + `applyExceptions` : une fenêtre absente est un placement impossible, pas un placement forcé. Échec ⇒ traitement explicite de l'AC4 | §14.6 |
| AC2 — heure précise, sans toucher au contenu ; recalcul si les disponibilités changent | `session_placements` (table distincte, ADR-016 §1) ; type de sortie sans champ de contenu ; trigger `availability_slots_refresh_placements` → job (`db-schema.md` §11.4) | §14.2, §14.6 |
| AC3 — signalement d'imprévu et réajustement | `POST /schedule/incidents` (bouton, aucune saisie) → `resolveScheduleIncident()` synchrone ; garde-fous AC8/AC10 revérifiés ; `origin` + `reason` servent le « pourquoi » | §14.5, §14.6 |
| AC3 (dernier `AND`) — `session_log` `not_done` si la séance n'est pas réalisée | Job `schedule_closeout` à 03 h locale, 4 issues journalisées ; restitution `D-notdone-notice` + acquittement `schedule_incidents.acknowledged_at` (amendement ADR-017 §8-§9) | §14.5, §14.7, ADR-017 |
| AC4 — aucune séance perdue silencieusement | `status = 'cancelled_week'` (sortie nominale, `200`), contrainte `session_placements_cancelled_has_no_schedule`, `reschedule_scope = 'current_week'` (aucun report cumulatif) | §14.5, `db-schema.md` §11.3 |
| AC5 — vue dominicale cohérente avec le Dashboard | Une seule lecture (`fetchWeekPlan`) pour `/planning` et `/dashboard` ; aucune route dupliquée | §14.5 |
| AC6 — paywall hérité, signalement en accès libre | `requireEntitlement()` inchangé sur `/plan/week` ; `POST /schedule/incidents` n'appelle **jamais** `requireEntitlement()` et ne consomme aucun accès (ADR-008 §5 étendu) | §3.3, §14.5 |

### 14.10 Points de contact laissés à la suite (F4 ou reprise)

1. **`apps/web/lib/jobs/drain.ts`** — le dispatcher par `kind` porte désormais 2 branches F1 + 3 F2 + 2 F3. Toute feature suivante y ajoutera les siennes : conflit de fusion mécanique, jamais sémantique. Le jour où il dépassera la dizaine de branches, extraire une table de correspondance `kind → handler` sera préférable à un `else if` de plus.
2. **`rulesets`** — version courante `0.3.0-dev` (reprend `0.2.0-dev` + section `planning`). Toute feature qui ajoute un paramètre publie `0.4.0-dev` en reprenant `0.3.0-dev` — **jamais** une modification en place (ADR-007 §1).
3. **`session_placements` est une projection dérivée** : elle peut être vidée et reconstruite. Toute lecture qui s'en servirait comme source de vérité indépendante (sans `planned_sessions`) serait un contresens.
4. **Le moteur ignore toujours `slot` et `max_minutes`** (`09-build-sessions.ts` ne lit que `weekday`). La F3 rattrape en aval une contrainte qui pourrait être respectée en amont ; le faire remonter dans le moteur est une décision de **contenu**, donc F1, et reste ouverte (§12, question 19).
5. **`session_logs.started_at` (F2) × `session_placements.scheduled_time` (F3)** : l'écart prévu / réel est désormais mesurable sans aucune colonne supplémentaire. Personne ne l'exploite encore — c'est une matière première offerte à la détection de stagnation ou à un futur indicateur de régularité.
