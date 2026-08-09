# Plan technique — US-01 — Coach IA personnalisé (entraînement + nutrition)

> Plan d'implémentation rédigé par `architect` le 2026-08-04. Lecture seule pour `developer` et les autres agents.
>
> Branche : `feature/US-01-coach-ia-personnalise`
> Référence fonctionnelle : `/07-spec-feature1-coach-ia.md` (fait foi)
> Référence technique : `/08-architecture.md` (stack, schéma BDD complet, contrats d'API)
> Décisions : `/docs/adr/ADR-001` → `ADR-011`

---

## 0. Avertissement de dimensionnement

Cette US n'est pas une feature ordinaire : **c'est la fondation entière du produit**. Elle contient 14 critères d'acceptation, 6 écrans, 34 tables, un moteur de décision métier et une intégration de paiement. Tenter de la livrer en une seule passe est le principal risque du projet.

**Découpage d'implémentation recommandé en 5 lots**, chacun livrable et testable, sur la même branche `feature/US-01-coach-ia-personnalise` :

| Lot | Contenu | AC couverts | Livrable vérifiable |
|---|---|---|---|
| **L1 — Socle** | Monorepo, Supabase, migrations, auth, RLS, seeds, CI | — | `supabase db reset` passe, tests RLS verts |
| **L2 — Moteur** | `@hybride/rules-engine` complet + tests property-based, hors UI | AC1, AC2, AC6→AC11 | Le moteur génère un plan valide depuis un contexte fixture |
| **L3 — Onboarding** | Chat LLM, disclaimer, consentement, génération du 1ᵉʳ plan, négociation d'objectif | AC1, AC2, AC3, AC12 | Un utilisateur arrive au Dashboard avec un plan |
| **L4 — Boucle quotidienne** | Dashboard, Séance/Repas du jour, saisie, ajustement immédiat, explicabilité | AC4, AC7, AC9, AC11 | La boucle d'usage tourne |
| **L5 — Rituel & monétisation** | Cron, révision hebdo + diff, stagnation, paywall, Stripe, fin d'objectif | AC5, AC6, AC13, AC14 | Conversion possible, rituel du dimanche opérationnel |

**Une validation humaine est recommandée à la fin de L2** (le moteur porte toute la valeur et toute la sécurité produit) avant d'engager L3 à L5.

---

## 1. Composants à créer / modifier

Tous les composants sont **Server Components par défaut**. `Client` uniquement pour l'interactivité réelle.

### 1.1 Packages (ADR-003)

| Package | Emplacement | Rôle |
|---|---|---|
| `@hybride/domain` | `/packages/domain/` | Types + schémas Zod : contrats API, `PlanningContext`, `RulesetParamsSchema`, `PlanDiffItem`. Aucune dépendance. |
| `@hybride/rules-engine` | `/packages/rules-engine/` | Moteur pur. **Aucune dépendance réseau/base autorisée.** |
| `@hybride/coach-llm` | `/packages/coach-llm/` | Port `LlmProvider` + adaptateurs + rendu template de repli + contrôle d'intégrité numérique. |
| `@hybride/db` | `/packages/db/` | Client Supabase typé, repositories, types générés. |

### 1.2 Onboarding (AC1, AC2, AC3)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `OnboardingLayout` | `/apps/web/app/onboarding/layout.tsx` | Server | Créer |
| `OnboardingChatPage` | `/apps/web/app/onboarding/chat/page.tsx` | Server | Créer |
| `CoachChat` | `/components/onboarding/coach-chat.tsx` | **Client** | Créer — consomme le flux SSE |
| `ChatBubble` | `/components/onboarding/chat-bubble.tsx` | Server | Créer |
| `CoachTypingIndicator` | `/components/onboarding/coach-typing-indicator.tsx` | **Client** | Créer — état « le coach écrit » (`04-flow.md`) |
| `AnswerInput` | `/components/onboarding/answer-input.tsx` | **Client** | Créer |
| `DisclaimerPage` | `/apps/web/app/onboarding/disclaimer/page.tsx` | Server | Créer — **écran bloquant dédié** |
| `DisclaimerAcknowledgement` | `/components/onboarding/disclaimer-acknowledgement.tsx` | **Client** | Créer |
| `HealthConsentPage` | `/apps/web/app/onboarding/consentement/page.tsx` | Server | Créer — **écran distinct du disclaimer** |
| `HealthConsentForm` | `/components/onboarding/health-consent-form.tsx` | **Client** | Créer |
| `ProfileRecap` | `/components/onboarding/profile-recap.tsx` | **Client** | Créer — AC1 : l'utilisateur **valide** le profil extrait par le LLM |
| `ObjectiveNegotiation` | `/components/onboarding/objective-negotiation.tsx` | **Client** | Créer — AC2 : accepter une proposition ou confirmer l'objectif initial |

### 1.3 Dashboard (AC1, AC5, AC13)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `DashboardPage` | `/apps/web/app/(app)/dashboard/page.tsx` | Server | Créer |
| `CoachPlanCard` | `/components/dashboard/coach-plan-card.tsx` | Server | Créer — **en premier, bordure accent** (zoning + maquettes) |
| `WeeklyPreviewCard` | `/components/dashboard/weekly-preview-card.tsx` | Server | Créer — masquée/floutée hors abonnement |
| `UpsellBanner` | `/components/dashboard/upsell-banner.tsx` | **Client** | Créer — disparaît si `tier = 'premium'` |
| `FreeAccessMeter` | `/components/dashboard/free-access-meter.tsx` | Server | Créer — « il te reste N accès » ; ton non punitif |
| `WeeklyReviewBadge` | `/components/dashboard/weekly-review-badge.tsx` | Server | Créer — AC5, garantie de repli si la notification n'arrive pas |
| `DashboardEmptyState` | `/components/dashboard/empty-state.tsx` | Server | Créer — premier accès, plan tout juste généré (`04-flow.md`) |

### 1.4 Séance / Repas du jour (AC4, AC9, AC11)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `TodayPage` | `/apps/web/app/(app)/aujourdhui/page.tsx` | Server | Créer |
| `SessionDetail` | `/components/today/session-detail.tsx` | Server | Créer |
| `NutritionTargets` | `/components/today/nutrition-targets.tsx` | Server | Créer — AC11, cibles modulées + conseils avant/pendant/après |
| `DailyLogForm` | `/components/today/daily-log-form.tsx` | **Client** | Créer — **4 signaux entraînement + 2 nutrition**, plus la question conditionnelle `painAtRest` (voir §5, risque R7) |
| `AdjustmentFeedback` | `/components/today/adjustment-feedback.tsx` | **Client** | Créer — retour immédiat après saisie (AC4) |
| `PainReferralNotice` | `/components/today/pain-referral-notice.tsx` | Server | Créer — AC9 niveaux 2 et 3, **jamais derrière le paywall** |
| `RestDayEmptyState` | `/components/today/rest-day-empty-state.tsx` | Server | Créer — jour de repos (`04-flow.md`) |

### 1.5 Explicabilité (AC1, AC5, AC7)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `ExplanationInline` | `/components/coach/explanation-inline.tsx` | Server | Créer — `short_text` par défaut |
| `ExplanationSheet` | `/components/coach/explanation-sheet.tsx` | **Client** | Créer — « en savoir plus », `long_text` + données citées |
| `CalibrationNotice` | `/components/coach/calibration-notice.tsx` | Server | Créer — AC7, « je ne peux pas encore conclure » |

### 1.6 Révision hebdomadaire (AC5)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `WeeklyReviewPage` | `/apps/web/app/(app)/revision/page.tsx` | Server | Créer |
| `PlanDiffView` | `/components/review/plan-diff-view.tsx` | Server | Créer — composant de comparaison avant/après dédié (notes UX de la fiche) |
| `DiffItemRow` | `/components/review/diff-item-row.tsx` | Server | Créer — direction ↑/↓ + explication |
| `FirstWeekNotice` | `/components/review/first-week-notice.tsx` | Server | Créer — cas `fromWeek = null` |

### 1.7 Paywall et abonnement (AC13)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `PaywallGate` | `/components/paywall/paywall-gate.tsx` | Server | Créer — **n'affiche pas de contenu qu'il masque** ; les données ne sont pas envoyées au client |
| `SubscriptionPage` | `/apps/web/app/(app)/abonnement/page.tsx` | Server | Créer |
| `OfferCard` | `/components/billing/offer-card.tsx` | Server | Créer — prix **lu depuis `/billing/offer`**, aucun montant en dur |
| `PaymentElementForm` | `/components/billing/payment-element-form.tsx` | **Client** | Créer — Stripe Elements + états chargement/refus (`04-flow.md`) |
| `InvoicesPage` | `/apps/web/app/(app)/facturation/page.tsx` | Server | Créer — écran S2 |

### 1.8 Bibliothèques serveur

| Module | Emplacement | Rôle |
|---|---|---|
| `entitlements.ts` | `/apps/web/lib/entitlements.ts` | `requireEntitlement()` — autorité unique du paywall |
| `regenerate-plan.ts` | `/apps/web/lib/orchestration/regenerate-plan.ts` | Squelette commun des 4 orchestrateurs (`08-architecture.md` §3.2) |
| `build-planning-context.ts` | `/apps/web/lib/orchestration/build-planning-context.ts` | Construction + hash canonique du snapshot |
| `materialize-plan-version.ts` | `/apps/web/lib/orchestration/materialize-plan-version.ts` | **Seul** chemin d'écriture de la projection (ADR-004) |
| `render-explanations.ts` | `/apps/web/lib/orchestration/render-explanations.ts` | LLM + contrôle d'intégrité + repli template |
| `jobs/` | `/apps/web/lib/jobs/` | Enrôlement, drain, verrous |

---

## 2. API routes / Server Actions

Contrats complets et types de retour : **`/08-architecture.md` §6**. Résumé d'implémentation :

| Route Handler | Fichier | Auth | Validation | Effets de bord |
|---|---|---|---|---|
| `POST /api/v1/onboarding/session` | `app/api/v1/onboarding/session/route.ts` | authentifié | — | Crée `onboarding_sessions` |
| `POST /api/v1/onboarding/session/[id]/messages` | `.../messages/route.ts` | authentifié + propriétaire | `{ content: z.string().min(1).max(2000) }` | Appel LLM (SSE), `onboarding_messages`, patch `profile_draft`. **Rate limité.** |
| `POST /api/v1/onboarding/session/[id]/disclaimer` | `.../disclaimer/route.ts` | authentifié | `{ documentVersion }` | `consents` (`medical_disclaimer`) |
| `POST /api/v1/consents` | `app/api/v1/consents/route.ts` | authentifié | `ConsentInputSchema` | `consents` append-only |
| `POST /api/v1/onboarding/session/[id]/complete` | `.../complete/route.ts` | authentifié | `ConfirmedProfileSchema` | `athlete_profiles`, `athlete_sports`, `availability_slots`, `objectives`, `risk_flags`, **puis** `regeneratePlan('onboarding')` **ou** retour `objective_negotiation` |
| `POST /api/v1/objectives/[id]/negotiation` | `.../negotiation/route.ts` | authentifié | `{ decision, proposalId? }` | `objectives.user_decision` + `regeneratePlan('objective_renegotiation')` |
| `GET /api/v1/plan/today` | `app/api/v1/plan/today/route.ts` | authentifié | query vide | **Écrit `free_access_events`** si `tier = 'free'` ; `no-store` |
| `GET /api/v1/plan/week` | `.../week/route.ts` | authentifié + **premium** | `{ weekStart: z.string().date() }` | `402 PAYWALL_REQUIRED` sinon |
| `GET /api/v1/plan/macro` | `.../macro/route.ts` | authentifié + **premium** | — | idem |
| `GET /api/v1/plan/reviews/latest` | `.../reviews/latest/route.ts` | authentifié + premium | — | lecture `plan_diffs` |
| `POST /api/v1/plan/reviews/[id]/acknowledge` | `.../acknowledge/route.ts` | authentifié | — | `plan_diffs.acknowledged_at` |
| `GET /api/v1/explanations/[id]` | `app/api/v1/explanations/[id]/route.ts` | authentifié | — | lecture ; jamais de génération à la volée |
| `POST /api/v1/session-logs` | `app/api/v1/session-logs/route.ts` | authentifié + **consentement santé** | `CreateSessionLogSchema` | `session_logs`, mise à jour `pain_episodes`, **`regeneratePlan('negative_signal' \| 'pain_protocol')` synchrone** |
| `POST /api/v1/nutrition-checkins` | `.../nutrition-checkins/route.ts` | authentifié | `NutritionCheckinSchema` | `nutrition_checkins` |
| `POST /api/v1/body-metrics` | `.../body-metrics/route.ts` | authentifié + consentement santé | `BodyMetricSchema` | `body_metrics` |
| `GET /api/v1/progress/diagnosis` | `.../progress/diagnosis/route.ts` | authentifié | — | lecture `stagnation_diagnoses` ; `calibration` si < 4 semaines |
| `GET /api/v1/entitlements` | `.../entitlements/route.ts` | authentifié | — | `no-store` |
| `GET /api/v1/billing/offer` | `.../billing/offer/route.ts` | authentifié | — | lit le `Price` Stripe — **aucun montant en dur** |
| `POST /api/v1/billing/subscription-intent` | `.../subscription-intent/route.ts` | authentifié | — | Customer + Subscription `default_incomplete`, renvoie `clientSecret` |
| `GET /api/v1/billing/invoices` | `.../invoices/route.ts` | authentifié | — | lecture Stripe |
| `POST /api/v1/webhooks/stripe` | `.../webhooks/stripe/route.ts` | **signature Stripe** | corps brut | `stripe_events` (idempotence) + `subscriptions`. `runtime = 'nodejs'` |
| `GET /api/v1/account/export` | `.../account/export/route.ts` | authentifié | — | export RGPD |
| `POST /api/v1/account/delete` | `.../account/delete/route.ts` | authentifié | confirmation | suppression/anonymisation |
| `POST /api/v1/consents/[code]/revoke` | `.../revoke/route.ts` | authentifié | — | retrait + purge + mode dégradé |
| `POST /api/v1/push/subscriptions` | `.../push/subscriptions/route.ts` | authentifié | `PushSubscriptionSchema` | `push_subscriptions` |
| `POST /api/v1/cron/enqueue-weekly-reviews` | `.../cron/.../route.ts` | `CRON_SECRET` | — | insère dans `job_queue` |
| `POST /api/v1/cron/enqueue-objective-checks` | idem | `CRON_SECRET` | — | AC14 |
| `POST /api/v1/cron/drain-jobs` | idem | `CRON_SECRET` | — | exécute les jobs, `maxDuration = 60` |

**Server Actions** : réservées à l'UI locale (marquer une notification lue, préférences d'affichage). Aucune logique métier (ADR-001).

---

## 3. Schéma BDD

Cette US crée **l'intégralité du schéma initial** : le « delta » est le schéma complet.

> **DDL canonique : `/08-architecture.md` §5.** Ne pas dupliquer ici — le fichier d'architecture fait foi en cas de divergence.

### Migrations à créer, dans cet ordre

| # | Fichier | Contenu |
|---|---|---|
| 1 | `supabase/migrations/0001_extensions_enums_helpers.sql` | `pgcrypto`, 24 types enum, `forbid_mutation()`, `has_active_consent()`, `is_staff()`, `touch_updated_at()` |
| 2 | `0002_identity_consents.sql` | `profiles`, `consent_documents`, `consents`, `risk_flags` |
| 3 | `0003_athlete_profile.sql` | `sports`, `athlete_profiles`, `athlete_sports`, `availability_slots`, `objectives` |
| 4 | `0004_onboarding.sql` | `onboarding_sessions`, `onboarding_messages` |
| 5 | `0005_engine_audit.sql` | `rulesets`, `engine_runs`, `decision_traces`, `explanations` |
| 6 | `0006_plans.sql` | `plans`, `plan_versions`, `plan_blocks`, `plan_weeks`, `planned_sessions`, `nutrition_days`, `plan_diffs` |
| 7 | `0007_actuals.sql` | `session_logs`, `nutrition_checkins`, `body_metrics`, `pain_episodes`, `stagnation_diagnoses` |
| 8 | `0008_billing_paywall.sql` | `subscriptions`, `stripe_events`, `free_access_events` |
| 9 | `0009_ops.sql` | `job_queue`, `notifications`, `push_subscriptions`, `plan_reviews` |
| 10 | `0010_seed_referentials.sql` | `sports`, 4 `consent_documents` v1 (fr), ruleset `0.1.0-dev` |

### Règles non négociables à respecter dans chaque migration

1. **`alter table X enable row level security;` immédiatement après chaque `create table`**, sans exception — y compris `stripe_events` et `job_queue` (RLS activée, aucune policy ⟹ accès `service_role` seul).
2. **Au moins une policy explicite** par table accessible à l'utilisateur.
3. **Aucune policy d'écriture** sur les tables produites par le moteur : `plans`, `plan_versions`, `plan_blocks`, `plan_weeks`, `planned_sessions`, `nutrition_days`, `decision_traces`, `explanations`, `engine_runs`, `pain_episodes`, `stagnation_diagnoses`, `free_access_events`, `subscriptions`.
4. **Trigger `forbid_mutation()`** sur `plan_versions`, `decision_traces`, `consents`.
5. **Insertion conditionnée au consentement santé** sur `session_logs`, `body_metrics`, `risk_flags`, `athlete_profiles`.
6. `supabase db reset` doit passer sans erreur avant tout commit.

### Index critiques (détail dans `08-architecture.md` §5)

`planned_sessions (user_id, scheduled_date)` · `session_logs (user_id, logged_date desc)` · `session_logs (user_id, pain_zone, logged_date desc) where pain <> 'none'` · `plan_versions (plan_id, version_number desc)` · `plan_versions (plan_id, created_at desc) where is_weekly_baseline` · `decision_traces (plan_version_id)` · `free_access_events (user_id, accessed_on desc)` · `job_queue (status, scheduled_for) where status = 'pending'` · `consents (user_id, document_code, granted_at desc)`.

---

## 4. Tests à écrire

À destination de `tester`. **Un test minimum par critère d'acceptation.**

### 4.1 Tests unitaires — moteur à règles (le cœur)

Fixtures de `PlanningContext` dans `/packages/rules-engine/__fixtures__/`.

- [ ] `purity.test.ts` — le moteur s'exécute avec `fetch`, `Date.now`, `Math.random` remplacés par `throw` — **couvre ADR-002/003**
- [ ] `determinism.test.ts` — même contexte + même ruleset ⟹ sortie strictement identique (100 itérations)
- [ ] `generate-plan.test.ts` — plan initial : blocs macro, détail J→J+7, intention J+8→J+14, rien au-delà — **AC1**
- [ ] `cold-start.test.ts` — volume de démarrage strictement inférieur au volume déclaré — **AC1, AC12**
- [ ] `traceability.test.ts` — **toute** valeur chiffrée du `PlanDraft` est couverte par ≥ 1 `DecisionTrace` — **fiche §5**
- [ ] `objective-feasibility.test.ts` — objectif irréaliste ⟹ `unrealistic` + propositions, jamais de plan silencieux — **AC2**
- [ ] `risk-restrictions.test.ts` — TCA/grossesse ⟹ déficit calorique bloqué, garde-fou dur tracé — **AC3, AC11**
- [ ] `asymmetry.property.test.ts` — **property-based** : pour tout contexte et tout trigger ≠ `weekly_review`, aucune trace `direction = 'increase'` — **AC4**
- [ ] `no-backlog.test.ts` — 3 séances non réalisées ⟹ aucun rattrapage cumulatif, reprojection depuis J — **AC4**
- [ ] `diff-plan-versions.test.ts` — diff lisible, chaque item porte ≥ 1 `decisionTraceId` — **AC5**
- [ ] `stagnation.test.ts` — les 3 diagnostics sont produits sur 3 jeux de données distincts ; inobservance ⟹ jamais `increase_load` — **AC6**
- [ ] `calibration.test.ts` — < 4 semaines ⟹ `status = 'calibration'`, `confidence = 'calibrating'` — **AC7**
- [ ] `guardrails.property.test.ts` — **property-based, le test le plus important du projet** : pour tout contexte généré aléatoirement, le plan respecte simultanément le plafond de progression, le plafond de séances intenses, la décharge obligatoire et le maximum de jours consécutifs sans repos — **AC8**
- [ ] `guardrails-block-increase.test.ts` — signal de fatigue/douleur actif ⟹ hausse bloquée même en révision hebdomadaire — **AC8**
- [ ] `pain-protocol.test.ts` — 3 transitions : légère ⟹ adaptation ; N signaux même zone ⟹ pause + consultation ; effort **ET** repos ⟹ arrêt + orientation, **sans alternative proposée** — **AC9**
- [ ] `interference.test.ts` — espacement respecté entre séance intense et force sur mêmes groupes ; charge répartie globalement ; `interference_note` renseignée — **AC10**
- [ ] `nutrition.test.ts` — modulation repos/endurance/intensité ; `kcal_target >= kcal_safety_floor` toujours ; jamais de déficit agressif — **AC11**
- [ ] `cold-regime.test.ts` — plan complet généré avec `dataRegime = 'cold'` et zéro donnée connectée — **AC12**
- [ ] `objective-end.test.ts` — date cible dépassée ⟹ propositions (nouvel objectif / transition), jamais de plan vide — **AC14**
- [ ] `free-access.test.ts` — `evaluateFreeAccess` sur les deux stratégies (`fixed_week`, `rolling_7d`) à partir du même journal — **AC13, ADR-008**

### 4.2 Tests unitaires — service LLM

- [ ] `numeric-integrity.test.ts` — un texte introduisant un nombre absent des traces est **rejeté**, `fallback_used = true` — **ADR-002 §3**
- [ ] `template-fallback.test.ts` — provider LLM en erreur ⟹ explication template produite, jamais d'échec propagé
- [ ] `profile-extraction.test.ts` — sortie LLM non conforme au schéma Zod ⟹ reformulation, aucune persistance
- [ ] `no-engine-import.test.ts` — `coach-llm` n'importe pas `rules-engine` (test de frontière)

### 4.3 Tests d'intégration

- [ ] `rls.test.ts` — **pour chaque table** : l'utilisateur A ne lit ni n'écrit aucune ligne de B
- [ ] `rls-coverage.test.ts` — échoue si une table de `public` n'a pas RLS activée ou n'a aucune policy
- [ ] `rls-health-consent.test.ts` — insertion dans `session_logs` **refusée** sans consentement santé actif — **AC3**
- [ ] `immutability.test.ts` — `UPDATE`/`DELETE` sur `plan_versions`, `decision_traces`, `consents` lèvent une exception
- [ ] `onboarding-complete.test.ts` — profil confirmé ⟹ `plan_generated` ; objectif irréaliste ⟹ `objective_negotiation` — **AC1, AC2**
- [ ] `session-log-adjustment.test.ts` — RPE 9 + gêne ⟹ nouvelle `plan_version` `negative_signal`, `direction = 'decrease'` — **AC4**
- [ ] `paywall.test.ts` — 4ᵉ jour d'accès ⟹ `402` ; `/plan/week` en `free` ⟹ `402` ; contenu semaine **absent du payload** — **AC13**
- [ ] `free-access-idempotency.test.ts` — 10 appels à `/plan/today` le même jour ⟹ 1 seul `free_access_events`
- [ ] `entitlement-unlock.test.ts` — webhook `customer.subscription.created` ⟹ limitations levées immédiatement — **AC13**
- [ ] `stripe-webhook-idempotency.test.ts` — même événement rejoué 3 fois ⟹ un seul traitement
- [ ] `weekly-review-job.test.ts` — enrôlement dupliqué ⟹ 1 seul job (clé d'idempotence) ; job produit version + diff + notification — **AC5**
- [ ] `weekly-review-llm-failure.test.ts` — LLM en panne ⟹ job réussit, explications en template, notification envoyée
- [ ] `progress-calibration.test.ts` — < 4 semaines ⟹ `status = 'calibration'` — **AC7**

### 4.4 Tests E2E (Playwright)

- [ ] `onboarding.spec.ts` — golden path : inscription → chat → **disclaimer acquitté** → **consentement santé** → récap validé → plan affiché au Dashboard — **AC1, AC3**
- [ ] `onboarding-negotiation.spec.ts` — objectif irréaliste ⟹ écran de négociation ; les deux issues fonctionnent — **AC2**
- [ ] `onboarding-misunderstood.spec.ts` — réponse incompréhensible ⟹ le coach reformule (`04-flow.md`)
- [ ] `daily-loop.spec.ts` — Dashboard → Séance du jour → saisie 4+2 signaux → retour avec plan ajusté et explication — **AC4**
- [ ] `pain-acute.spec.ts` — douleur à l'effort **et** au repos ⟹ orientation professionnel de santé affichée, **accessible sans abonnement** — **AC9, ADR-008 §5**
- [ ] `explanation.spec.ts` — explication courte visible ; « en savoir plus » ouvre le raisonnement complet — **AC1, AC5**
- [ ] `paywall.spec.ts` — 4ᵉ jour ⟹ redirection vers Paiement ; ton non punitif ; la saisie reste accessible — **AC13**
- [ ] `subscribe.spec.ts` — Payment Element (carte de test) → webhook → Dashboard débloqué, bandeau upsell disparu — **AC13**
- [ ] `weekly-review.spec.ts` — diff hebdomadaire affiché avec avant/après lisible — **AC5**
- [ ] `rest-day.spec.ts` — jour de repos ⟹ état vide explicite, pas d'erreur

**Objectif de couverture** : 70 % global sur les fichiers modifiés, **90 % minimum sur `@hybride/rules-engine`** (c'est le composant qui porte le risque de blessure).

---

## 5. Risques identifiés

| # | Risque | Prob. | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Sous-estimation du périmètre** : 14 AC + 6 écrans + 34 tables traités comme une US ordinaire | Élevée | Critique | Découpage en 5 lots (§0) ; validation humaine après L2 |
| R2 | **Seuils de sécurité AC8 inconnus** : implémentation avec des valeurs inventées par un développeur | Élevée | **Critique (sécurité utilisateur)** | ADR-007 : `null` bloquants, refus de démarrage en production ; ruleset `0.x` en dev uniquement |
| R3 | **Le LLM produit un chiffre faux** dans une explication | Moyenne | Élevé | Contrôle d'intégrité numérique + repli template (ADR-002 §3) ; test dédié ; métrique `numeric_integrity_ok` en production |
| R4 | **Dérive de l'isolation du moteur** : import réseau/base ajouté « juste une fois » | Moyenne | Élevé | Package séparé, ESLint boundaries, test de pureté en CI (ADR-003) |
| R5 | **Latence LLM sur la saisie quotidienne** : l'utilisateur attend le texte alors que l'ajustement est déjà calculé | Élevée | Moyen | Ajustement synchrone (moteur, quelques ms), explication rendue en template si budget de latence dépassé, enrichie ensuite |
| R6 | **Coût LLM par onboarding** non maîtrisé | Moyenne | Moyen | Rate limiting, borne de tours par session, questions fermées après N échecs, `turn_count` suivi |
| R7 | **`pain_at_rest` absent des maquettes** ⟹ AC9 niveau 3 indétectable | **Certaine** | Élevé | Question conditionnelle ajoutée au formulaire (affichée seulement si `pain = 'pain'`) ; **retour vers `designer` et `spec-writer` requis** (§7) |
| R8 | **Notification hebdomadaire non reçue** (Web Push iOS hors PWA installée) | Élevée | Moyen | Triple canal : push + e-mail Brevo + badge persistant Dashboard (ADR-001) |
| R9 | **Fuseaux horaires** : « dimanche soir » et « semaine » mal calculés | Moyenne | Moyen | `profiles.timezone` unique source ; tests sur ≥ 2 fuseaux ; jamais de date serveur implicite |
| R10 | **Webhook Stripe en panne** ⟹ utilisateur payant sans accès | Faible | Élevé | Idempotence + rejeu + réconciliation à la connexion (`GET /entitlements` interroge Stripe si `subscriptions` est incohérent) + alerte `devops` |
| R11 | **Volumétrie `decision_traces`** (10-20 k lignes/utilisateur/an) | Moyenne | Faible | Index ciblés ; politique de rétention ; partitionnement à prévoir au-delà de quelques milliers d'utilisateurs |
| R12 | ~~**Écran « Connexion données » du funnel appartient à la F2**~~ | Certaine | Faible | **Résolu (2026-08-06)** : retiré du funnel V1, onboarding → Dashboard direct (voir `04-flow.md`) |
| R13 | **Divergence snapshot / projection** du plan | Faible | Élevé | Chemin d'écriture unique `materializePlanVersion()` + test de cohérence par rejeu (ADR-004) |
| R14 | **Sport déclaré non documenté** ⟹ plan potentiellement inadapté | Moyenne | Élevé | `sports.is_documented = false` ⟹ profil générique prudent + explication honnête ; question ouverte n°7 à trancher |

---

## 6. Ordre des étapes (pour developer)

### Lot L1 — Socle

1. Initialiser le monorepo : `pnpm-workspace.yaml`, `turbo.json`, `apps/web` (Next.js 16 + Tailwind + shadcn/ui), `packages/{domain,rules-engine,coach-llm,db}`.
2. Configurer les frontières : ESLint `import/no-restricted-paths`, `transpilePackages` côté Next.js, alias `@hybride/*`.
3. `supabase init` ; écrire les migrations `0001` → `0010` (§3) ; `supabase db reset` doit passer.
4. Générer les types : `supabase gen types typescript --local > packages/db/src/types.ts`.
5. Auth Supabase : inscription, connexion, réinitialisation de mot de passe (écran S1), middleware de session.
6. Écrire `rls.test.ts`, `rls-coverage.test.ts`, `immutability.test.ts` — **doivent être verts avant de continuer**.
7. `pnpm lint && pnpm typecheck && pnpm build`.
8. Commit : `feat(US-01): socle monorepo, schéma Supabase et RLS`.

### Lot L2 — Moteur à règles

9. `@hybride/domain` : `PlanningContext`, `PlanDraft`, `DecisionTrace`, `RulesetParamsSchema` (avec refus des `null` sur les garde-fous en production), contrats API.
10. `@hybride/rules-engine` : implémenter le pipeline en 12 étapes dans l'ordre imposé (`08-architecture.md` §4.2). L'API interne de chaque règle retourne `{ value, trace }` — jamais `value` seul.
11. Écrire **d'abord** `guardrails.property.test.ts` et `asymmetry.property.test.ts`, puis les autres tests unitaires du §4.1.
12. Seeder `rulesets` `0.1.0-dev` avec des valeurs documentées et marquées « à valider », et `docs/rulesets/0.1.0-dev.md` listant les sources.
13. Commit : `feat(US-01): moteur à règles auditable et garde-fous`.
14. **⛔ STOP — point de validation humaine recommandé** sur le moteur avant de poursuivre.

### Lot L3 — Onboarding

15. `@hybride/coach-llm` : port `LlmProvider`, adaptateur du fournisseur retenu, mock déterministe pour les tests, rendu template, contrôle d'intégrité numérique.
16. Routes onboarding (`session`, `messages` en SSE, `disclaimer`, `consents`, `complete`).
17. Orchestrateur `regeneratePlan()` + `buildPlanningContext()` + `materializePlanVersion()` + `renderExplanations()`.
18. Écrans : chat, disclaimer, consentement, récap de profil, négociation d'objectif.
19. E2E `onboarding.spec.ts`, `onboarding-negotiation.spec.ts`, `onboarding-misunderstood.spec.ts`.
20. Commit : `feat(US-01): onboarding conversationnel et génération du plan initial`.

### Lot L4 — Boucle quotidienne

21. `entitlements.ts` + `free_access_events` + `PaywallGate` (avant les écrans, pour ne jamais avoir à « rajouter le paywall après »).
22. Routes `plan/today`, `session-logs`, `nutrition-checkins`, `explanations/[id]`, `progress/diagnosis`.
23. Écrans Dashboard et Séance/Repas du jour, y compris états vides / chargement / erreur de `04-flow.md`.
24. Composants d'explicabilité (inline + « en savoir plus » + calibration).
25. E2E `daily-loop.spec.ts`, `pain-acute.spec.ts`, `explanation.spec.ts`, `rest-day.spec.ts`.
26. Commit : `feat(US-01): boucle quotidienne, saisie et ajustement immédiat`.

### Lot L5 — Rituel et monétisation

27. `job_queue`, routes cron, `vercel.json` (cron horaire, quotidien, drain 5 min), `CRON_SECRET`.
28. `runWeeklyReview()` : stagnation → génération → `plan_diffs` → explications → notification.
29. Web Push (VAPID + service worker) et e-mail Brevo ; badge Dashboard.
30. Stripe : `billing/offer`, `subscription-intent`, `webhooks/stripe`, écrans Abonnement et Facturation.
31. AC14 : cron de fin d'objectif + écran de transition.
32. E2E `weekly-review.spec.ts`, `paywall.spec.ts`, `subscribe.spec.ts`.
33. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
34. Commit : `feat(US-01): révision hebdomadaire, paywall et abonnement`.

### Interdits explicites pour `developer`

- Écrire une valeur de garde-fou en dur dans le code (elle va dans `rulesets.params`).
- Écrire un prix ou « 19 € » dans un composant (le tarif vient de Stripe).
- Créer une table sans RLS ni policy.
- Faire écrire un chiffre de plan par le LLM.
- Modifier `/07-spec-feature1-coach-ia.md` ou les maquettes.
- Ajouter une dépendance réseau/base à `@hybride/rules-engine`.

---

## 7. ADR

Onze ADR créés pour cette feature, tous dans `/docs/adr/` :

| ADR | Décision |
|---|---|
| ADR-001 | Plateforme cliente : PWA mobile-first + architecture API-first |
| ADR-002 | Séparation stricte moteur à règles / LLM |
| ADR-003 | Monorepo pnpm + isolation physique du moteur |
| ADR-004 | Modèle de données du plan multi-échelle (macro/méso/micro) |
| ADR-005 | Versioning append-only du plan et diff hebdomadaire matérialisé |
| ADR-006 | Journal d'auditabilité : `decision_traces` séparé de `explanations` |
| ADR-007 | Paramètres de sécurité versionnés en base (`rulesets`) |
| ADR-008 | Compteur d'accès libre : journal d'événements + fenêtre calculée |
| ADR-009 | Abonnement Stripe via Payment Element embarqué |
| ADR-010 | Données de santé : consentement versionné, minimisation LLM, hébergement UE |
| ADR-011 | Traitements périodiques : Vercel Cron + file de jobs idempotente |

---

## 8. Prochaine étape

→ **STOP — validation humaine obligatoire** du plan technique avant d'invoquer `developer`.

Points à arbitrer par le fondateur avant de démarrer l'implémentation (détail en `08-architecture.md` §12) :

1. **Prix de l'abonnement** — non fixé. Le 19 €/mois des maquettes est un placeholder de `designer`.
2. **Seuils de sécurité de l'AC8** — bloquants pour la mise en production (pas pour démarrer le développement).
3. **Web/PWA vs application native** — hypothèse H1 à confirmer.
4. **`pain_at_rest`** — retour vers `designer`/`spec-writer` pour compléter le formulaire de saisie (AC9 niveau 3 sinon indétectable).
5. ~~**Écran « Connexion données »** — appartient à la F2 mais figure dans le funnel de la F1.~~ **Résolu (2026-08-06)** : retiré du funnel V1.
6. ~~**Fournisseur LLM** (contrainte UE + DPA) et **plan Vercel Pro** — à cadrer avec `devops`.~~ **Fournisseur LLM tranché (2026-08-06) : Mistral AI** (voir ADR-010). **Plan Vercel Pro** : budget pas encore validé, non bloquant pour démarrer, à trancher avant la mise en production du lot L5.
