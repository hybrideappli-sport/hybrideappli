# Architecture technique — Hybride Club

> Phase Plan du cycle Ottho. Rédigé par `architect` le 2026-08-04. **Révisé le 2026-08-07** (arbitrage post-revue du Lot L1 — voir §5 et §12). **Mise à jour doc de fin de projet le 2026-08-11** par `doc-writer` (§5.3, §6.8, §12 — état réel post-revue de fin de projet et contre-revue, `reviews/US-01-coach-ia-personnalise-review*.md`).
> Document projet, source de vérité technique. Lecture seule pour `developer`, `tester`, `doc-writer`.
>
> Entrées : `07-spec-feature1-coach-ia.md` (fonctionnel, fait foi), `05-zoning-pencil.md`, `04-flow.md`, `03-mvp.md`, `02-persona.md`, `06-recap.md`, `backlog.md`, maquettes hi-fi Pencil (6 écrans).
> Décisions détaillées : `/docs/adr/`.
> **DDL canonique : `/docs/db-schema.md`** (extrait de ce document le 2026-08-07 — voir §5).
> Plan d'implémentation de la Feature 1 : `/plans/US-01-coach-ia-personnalise.md`.

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
| E-mail | **Brevo** | Standard agence, opérateur UE ; repli notification (limite Web Push iOS) |
| Push | **Web Push (VAPID)** | ADR-001, ADR-011 |
| Jobs | **Vercel Cron (Pro) + file `job_queue` Postgres** (`SKIP LOCKED`) | ADR-011 |
| Hébergement | **Vercel**, fonctions en région UE (`cdg1`/`fra1`) | Standard agence ; contrainte de localisation ADR-010 |
| Monorepo | **pnpm workspaces + Turborepo** | Rend l'isolation du moteur vérifiable en CI ; ADR-003 |
| Tests | **Vitest** (unit/intégration) + **fast-check** (property-based sur les garde-fous) + **Playwright** (E2E) | Les bornes dures de l'AC8 sont des invariants : le property-based testing est l'outil adapté |
| Observabilité | Sentry + logs structurés + tables `engine_runs` / `job_queue` | À cadrer avec `devops` |

### Arborescence

```
hybride-club/
├─ apps/web/                       # Next.js 16 — PWA
│  ├─ app/
│  │  ├─ (marketing)/              # Accueil
│  │  ├─ (auth)/                   # connexion, inscription, reset (S1)
│  │  ├─ (app)/                    # dashboard, aujourd-hui, semaine, abonnement, facturation (S2)
│  │  ├─ onboarding/               # chat, disclaimer, consentement
│  │  └─ api/v1/**                 # Route Handlers
│  ├─ components/
│  └─ e2e/                         # Playwright
├─ packages/
│  ├─ domain/                      # types + Zod (contrats API, PlanningContext, Ruleset)
│  ├─ rules-engine/                # moteur PUR
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
└───────────────────────────┬──────────────────────────────────────────┘
                            │ HTTPS — contrats Zod partagés
┌───────────────────────────▼──────────────────────────────────────────┐
│  API v1 (Route Handlers)                                             │
│  auth · validation · ENTITLEMENTS/PAYWALL · orchestration · RGPD     │
└───┬────────────┬─────────────┬──────────────┬────────────┬───────────┘
    │            │             │              │            │
    ▼            ▼             ▼              ▼            ▼
┌────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐  ┌─────────┐
│ rules- │  │ coach-   │  │  db     │  │  Stripe   │  │ Brevo / │
│ engine │  │ llm      │  │(Supabase│  │           │  │ WebPush │
│  PUR   │  │  (UE)    │  │  + RLS) │  │           │  │         │
└────────┘  └──────────┘  └─────────┘  └───────────┘  └─────────┘
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
  dataRegime: 'cold' | 'declared' | 'connected';   // AC12 / anticipation F2
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

> **Le DDL canonique complet (34 tables) vit désormais dans [`/docs/db-schema.md`](docs/db-schema.md).**
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
- **Tables produites par le moteur** (plans, versions, traces, explications, diagnostics) : `SELECT` par le propriétaire **uniquement**. Aucune policy d'écriture ⟹ écriture réservée au `service_role`, qui contourne RLS. L'utilisateur ne peut jamais fabriquer un plan ni une trace.
- **Tables immuables** (`plan_versions`, `decision_traces`, `consents`) : trigger `BEFORE UPDATE OR DELETE` levant une exception, **y compris pour le `service_role`**. Une seule dérogation, décrite en §5.2.
- **Référentiels** (`sports`, `consent_documents`, `rulesets`) : `SELECT` pour `authenticated`, écriture `service_role`.
- **Tables de santé** (`athlete_profiles`, `session_logs`, `body_metrics`, `risk_flags`, `nutrition_checkins`) : policies `INSERT` **et `UPDATE`** conditionnées à `has_active_consent(auth.uid(), 'health_data_processing')`. Un retrait de consentement ferme la modification, pas seulement la création (ADR-010 §2, ADR-012 §2).
- **Consentements** : aucune policy d'écriture pour `authenticated`. `consents` s'écrit **exclusivement** via `service_role`, depuis une route API qui résout elle-même la version courante du document et calcule `ip_hash`/`user_agent`. Une FK composite vers `consent_documents` interdit de référencer un document inexistant (ADR-012 §1).
- **Privilèges** : `UPDATE` n'est **jamais** accordé par défaut à `authenticated`. C'est le seul privilège qu'une policy RLS ne sait pas restreindre à la colonne près : il est donc accordé table par table, et **au niveau colonne** dès que seule une partie de la ligne est légitimement modifiable (`plan_diffs(acknowledged_at)`, `notifications(read_at)`, `objectives(label, target_date, …)`, …). Un oubli de GRANT échoue bruyamment, au lieu de sur-autoriser en silence (ADR-012 §3).
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
- Le seed de `consent_documents` est un **prérequis dur relatif à l'environnement** : en production, aucun document n'est `is_current` tant que la migration d'activation juridique n'est pas livrée, donc l'onboarding y est bloqué par construction (ADR-010 §9, `docs/db-schema.md` §9.3). Hors production, `supabase/seed.sql` active la version provisoire.

---

## 6. Contrats d'API

Toutes les routes sont sous `/app/api/v1/`. Conventions communes :

- authentification par session Supabase (cookie) ; `401` sinon ;
- validation d'entrée **Zod** systématique, schémas exportés depuis `@hybride/domain` et réutilisés côté client ;
- erreurs normalisées : `{ error: { code, message, details? } }` avec des codes stables (`VALIDATION_FAILED`, `PAYWALL_REQUIRED`, `CONSENT_REQUIRED`, `CALIBRATION_IN_PROGRESS`, `ENGINE_FAILED`, `RATE_LIMITED`) ;
- toute route de lecture de plan est `dynamic = 'force-dynamic'`, `Cache-Control: no-store`.

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
};
```

| Route | Méthode | Notes |
|---|---|---|
| `/session-logs` | POST / PATCH | Ne consomme **pas** d'accès libre (ADR-008 §5) ; exige le consentement santé (`403 CONSENT_REQUIRED`) **en création comme en modification** |
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
| `/account/export` | GET | Export JSON intégral (profil, plans, logs, explications, traces, consentements) |
| `/account/delete` | POST | Appelle `erase_account(uuid)` en `service_role` : suppression **réelle** de toutes les données personnelles ; seul le registre `consents` survit, pseudonymisé (ADR-010 §8). Confirmation forte exigée côté client |
| `/consents` | POST | Enregistre un consentement (`granted = true`) — version résolue par le serveur |
| `/consents/:code/revoke` | POST | Retrait = **nouvelle ligne** `granted = false` (jamais un UPDATE) ; purge des données de santé ; coach en mode dégradé **explicite** |
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

---

## 8. Sécurité, RGPD, RLS

Détail complet : ADR-010 (données de santé), ADR-012 (modèle de privilèges). Synthèse opérationnelle :

| Règle | Mise en œuvre |
|---|---|
| RLS sur 100 % des tables | 34 tables, `enable row level security` + policy explicite. Test CI dédié qui échoue si une table sans RLS apparaît. |
| L'utilisateur ne fabrique jamais un plan | Aucune policy d'écriture sur les tables du moteur : `service_role` seul. |
| Consentement santé avant saisie **et avant modification** | Policies `INSERT` et `UPDATE` conditionnées par `has_active_consent()` sur `session_logs`, `body_metrics`, `risk_flags`, `athlete_profiles`, `nutrition_checkins`. |
| L'utilisateur ne se délivre pas son propre consentement | Aucune policy `INSERT` sur `consents` ; écriture `service_role` seule ; FK composite vers `consent_documents`. |
| Immuabilité de l'audit | Triggers `forbid_mutation()` sur `plan_versions`, `decision_traces`, `consents`. Dérogation unique : contexte d'effacement RGPD, scopé à un `user_id` **et** à `service_role`. |
| Écriture partielle plutôt que totale | `UPDATE` jamais accordé par défaut ; GRANTs au niveau colonne sur `plan_diffs`, `notifications`, `objectives`, `session_logs`, `athlete_profiles`, `profiles`, `nutrition_checkins`. |
| Fonctions non exposées par défaut | `EXECUTE` retiré de `PUBLIC` ; `erase_account()` réservée à `service_role`. |
| Effacement effectif (art. 17) | `POST /account/delete` → `erase_account()` : suppression réelle en cascade ; seul le registre `consents` survit, pseudonymisé. |
| Isolation entre utilisateurs | Tests d'intégration RLS : l'utilisateur A ne lit rien de B, sur chaque table. |
| Secrets | Variables Vercel uniquement ; `sk_live_*` en production seule ; hook `secret-scan` du plugin. |
| Minimisation LLM | Aucune donnée directement identifiante ; explications rendues à partir des seules `DecisionTrace`. |
| Localisation | Supabase UE, fonctions Vercel `cdg1`/`fra1`, Brevo UE, Mistral AI (UE). |
| Rate limiting | Sur `/onboarding/session/:id/messages` (coût LLM) et `/billing/subscription-intent`. |

La liste complète des tests d'intégration attendus sur le schéma est en fin de [`/docs/db-schema.md`](docs/db-schema.md).

---

## 9. Environnements et déploiement

| Environnement | Base | Stripe | LLM | Ruleset |
|---|---|---|---|---|
| Local | Supabase local (`supabase start`) | `sk_test` + `stripe listen` | mock déterministe par défaut | `0.1.0-dev` |
| Preview (par PR) | projet Supabase existant **`hybrideclub`** (`eu-west-1`) | `sk_test` | fournisseur réel, quota bridé | `0.1.0-dev` |
| Test (CI) | projet Supabase isolé | fixtures webhook | mock | fixture |
| Production | projet Supabase `prod` (UE) — **séparé, à créer plus tard** (confirmé 2026-08-06) | `sk_live` | fournisseur UE, DPA signé | `1.0.0` — **refus de démarrage si un garde-fou est `null`** |

**Note (2026-08-06)** : le fondateur réutilise un projet Supabase existant `hybrideclub` (région `eu-west-1`, conforme à la contrainte UE) comme base dev/preview plutôt qu'un projet créé pour cette feature. Rôle confirmé : dev/preview uniquement, un projet séparé sera créé pour la production le moment venu (séparation dev/prod classique préservée). Projet vierge, tout juste créé (confirmé 2026-08-06) — `developer` peut appliquer les migrations directement, aucun schéma existant à préserver.

**Note (2026-08-07)** : la base étant encore vierge de données réelles, les corrections de schéma issues de l'arbitrage du 2026-08-07 sont appliquées **en modifiant les migrations existantes** (`0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0009`) plutôt qu'en empilant une migration corrective — le schéma reste lisible d'un seul tenant. Cette liberté disparaît dès la première donnée de production.

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

---

## 11. Anticipation Features 2 et 3

Aucune ligne de code n'est écrite pour les Features 2 et 3, mais le schéma est conçu pour les absorber **sans refonte** :

**Feature 2 — Centralisation des données / score hybride**

- `data_source` (`declared` | `connected`) déjà présent sur `session_logs` et `body_metrics` : une donnée Strava s'insère comme une ligne de plus. La colonne `source` est volontairement hors du GRANT client : seul le connecteur serveur pourra écrire `connected`.
- `athlete_profiles.data_regime` et `PlanningContext.dataRegime` : le moteur sait déjà distinguer les régimes, ce qui matérialise l'AC12 (« la donnée connectée enrichit, ne conditionne jamais »).
- Le score hybride consommera `load_units` — unité inter-disciplines déjà normalisée (ADR-004 §4).
- À ajouter alors : `data_connections`, `sync_runs`, et une résolution de doublons déclaré/connecté.

**Feature 3 — Planning selon emploi du temps**

- `availability_slots` est déjà capté par l'onboarding de la F1 (dépendance explicitée en fiche §5).
- `planned_sessions` porte `scheduled_date` + `slot`, **pas d'heure** : la F3 ajoutera le placement horaire et la gestion des imprévus sans restructurer la table.
- La frontière est nette : **F1 décide QUOI et COMBIEN, F3 décide QUAND.**

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

### Questions ouvertes de la fiche, statut après architecture

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

### Questions ouvertes ajoutées par `architect`

1. **Prix de l'abonnement — non fixé.** Les maquettes affichent **19 €/mois, placeholder posé par `designer`**, sans fondement produit. À trancher : montant, périodicité (mensuel seul ? annuel ?), essai gratuit, TVA. Aucun montant n'est écrit dans le code (ADR-009).
2. **Champ `pain_at_rest` manquant dans les maquettes.** L'AC9 niveau 3 distingue une douleur présente « à l'effort **ET** au repos ». La fiche §4 décrit une saisie douleur à 3 niveaux + localisation, sans ce booléen. Sans lui, le niveau 3 est indétectable. → **retour vers `designer` et `spec-writer`** pour ajouter une question conditionnelle (affichée uniquement si `pain = 'pain'`), ce qui préserve la contrainte « formulaire rapide ».
3. **Mineur** : refus d'inscription (recommandé) ou parcours dégradé ? Non tranché (ADR-010).
4. **Mode dégradé après retrait du consentement santé** : parcours non spécifié par les 14 AC — toujours à formaliser avec `spec-writer` en tant que parcours produit à part entière (ADR-010, « Conséquences »), mais **implémenté** depuis la revue de fin de projet (finding B1) : `POST /api/v1/consents/:code/revoke` insère une nouvelle ligne `granted = false` (jamais un `UPDATE`), purge `session_logs`/`nutrition_checkins`/`body_metrics`/`pain_episodes`, et le blocage est explicité côté UI par `DegradedModeBanner` (`/dashboard`, `/aujourdhui`, `/compte`) plutôt que subi silencieusement. Le retrait ferme aussi la **modification** des données de santé existantes (ADR-012 §2). **Précision post-contre-revue (interaction B1 × B6)** : les `risk_flags` de type `pathology`/`minor` ne sont **plus** purgés au retrait — ils portent l'avertissement médical fixe de l'AC3, qui doit survivre pour un utilisateur qui garde l'usage de son plan déjà généré ; seuls `pregnancy`/`eating_disorder_history`/`other` le sont toujours (`purge-health-data-on-revoke.ts`). Le document `health_data_processing` a été mis à jour en conséquence (version `1.1.0`, voir point 10 ci-dessous et ADR-010 §10) : la base légale précise de cette conservation partielle **reste une question ouverte pour le conseil juridique**, explicitée comme telle dans le texte lui-même plutôt que masquée par une citation d'article RGPD approximative.
5. ~~**Fournisseur LLM** : à choisir avec contrainte UE + DPA + non-entraînement (ADR-010).~~ **Tranché le 2026-08-06 : Mistral AI** (voir ADR-010, mise à jour). Impacte le budget par onboarding, à chiffrer par `devops`.
6. **Plan Vercel Pro requis** pour la planification du rituel dominical (ADR-011) — **budget pas encore validé par le fondateur (2026-08-06)**, non bloquant pour démarrer le développement, à trancher avant la mise en production du rituel hebdomadaire (lot L5).
7. ~~**Écran « Connexion données »** (n°3 du flow) : il appartient à la Feature 2 mais est **positionné dans le funnel d'onboarding** de la F1 (`04-flow.md`).~~ **Résolu (2026-08-06)** : retiré du funnel V1 — l'onboarding route directement vers le Dashboard. Voir `04-flow.md`, révision du 2026-08-06.
8. **Conservation du registre de consentement après suppression de compte** (2026-08-07). L'architecture décide de le conserver, pseudonymisé, comme preuve du consentement recueilli (ADR-010 §8). **Tranché par le fondateur (2026-08-09) : 5 ans** à compter du dernier événement de consentement (voir ADR-010, question ouverte n°4). **Toujours ouvert** : le job de purge programmée à cette échéance n'est **pas implémenté** (confirmé à la contre-revue de fin de projet, finding I3 « partiel ») — le registre grossit sans purge automatique. Non bloquant pour le développement, bloquant pour l'ouverture commerciale.
9. **Rétention de `stripe_events`** (2026-08-07). **Résolu (2026-08-09, correction I3)** : rétention tranchée à 60 jours (au-delà de l'idempotence webhook et de la fenêtre de nouvelle tentative Stripe), purgée par `purge_stale_stripe_events()` (`0013_billing_robustness.sql`) via le cron quotidien `/cron/purge-stripe-events` (§6.8).
10. **Contenu juridique des `consent_documents` (`medical_disclaimer`, `health_data_processing`, `terms`, `privacy`) provisoire, non validé juridiquement** — ajouté suite à l'audit `code-reviewer` du Lot L1 (finding B3, 2026-08-07/09). Le texte inséré en `0010_seed_referentials.sql` porte explicitement la mention « Contenu provisoire — à faire valider juridiquement avant mise en production » dans son propre corps ; il est inséré avec `is_current = false` (hors production, `supabase/seed.sql` active la version provisoire pour débloquer développement et tests — ADR-010 §9) pour qu'aucun environnement ne le serve par défaut comme document en vigueur. **Mise à jour (2026-08-11)** : une nouvelle version `1.1.0` de `health_data_processing` a été ajoutée (`0014_health_data_processing_consent_v1_1_0.sql`, ADR-010 §10), pour rester cohérente avec la conservation partielle des `risk_flags` de sécurité décrite au point 4 — la version `1.0.0` promettait à tort une purge totale au retrait. `1.1.0` reste, comme `1.0.0` avant elle, un texte non validé juridiquement (`is_current = false` partout tant que la migration d'activation n'est pas publiée) ; elle **n'exige aucun re-consentement** (`has_active_consent()` ne teste que `document_code`, jamais `document_version`). **Action requise avant mise en production** : (a) faire valider juridiquement les textes (en particulier `health_data_processing`, à la fois pour la base légale RGPD art. 9 du traitement de données de santé et pour la base légale — non tranchée — de la conservation ciblée des indicateurs `pathology`/`minor` au retrait de ce seul consentement) ; (b) une fois validés, publier une migration dédiée qui insère la version validée (nouveau `version`) avec `is_current = true` — ne jamais faire passer `is_current` à `true` sur un contenu provisoire par un simple `UPDATE`. Propriétaire : fondateur (validation juridique) + `architect` (migration d'activation).
11. **Angle mort résiduel sur le plafond de progression de charge inter-version** (2026-08-11, constat de la contre-revue de fin de projet, finding B2). La régression mesurée (jusqu'à +165 % de volume d'entraînement en une seule révision hebdomadaire) a été corrigée : `computeWeeklyLoadTarget` (étape 6, `packages/rules-engine/src/pipeline/06-compute-weekly-load-target.ts`) borne désormais toute hausse par `weekly_load_progression_cap_pct` par rapport à `context.previousPlan` (même `weekStart`), en plus du plafond intra-draft déjà appliqué par `applyHardGuardrails` (étape 11). Un test de non-régression dédié (`load-progression-cap-across-versions.test.ts`) couvre les deux scénarios chiffrés par la contre-revue. **Reste un angle mort non couvert** : ce plafond compare `before` à la semaine de même `weekStart` dans `context.previousPlan.weeks` — si une semaine du nouveau plan **n'a pas d'équivalent** dans le snapshot précédent (`before === null`, hors de l'horizon détaillé/intention de la version précédente, ADR-004), `direction` est forcée à `'neutral'` et **aucun plafond inter-version ne s'applique** à cette semaine précise, faute de valeur de référence. Ce cas n'est aujourd'hui ni testé ni chiffré. À trancher avant la mise en production : soit documenter ce cas comme acceptable (une semaine hors snapshot n'a par construction jamais été montrée à l'utilisateur, donc rien à protéger d'une hausse perçue), soit ajouter une borne de repli (ex. par rapport à la moyenne des dernières semaines réellement montrées).
