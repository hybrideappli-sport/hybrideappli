# Revue de code — US-01 « Coach IA personnalisé »

Branche : `feature/US-01-coach-ia-personnalise` · HEAD `b729204` · revue unique de fin de projet
Périmètre : 12 commits (L1→L5), 34 tables, 11 migrations, 4 packages, 21 routes API, 10 specs E2E.

**Verdict : CORRECTIONS REQUISES.**

Le socle est de très bonne facture — RLS et modèle de privilèges rigoureux et testés, moteur pur et property-tested, immuabilité, isolation `rules-engine`/`coach-llm` vérifiée par ESLint, aucun secret en dur, aucun `console.log`/`TODO` résiduel, commentaires d'une qualité rare. Les problèmes bloquants ne sont pas des défauts de rigueur locale : ce sont **cinq chaînes fonctionnelles qui ne se referment jamais** (RGPD, progression du plan, garde-fous en production, contenu premium, détection de risque), plus un contournement de quota côté client.

---

## 🔴 Bloquants

### B1 — RGPD : aucune route de droits des personnes n'existe, `erase_account()` n'est jamais appelée

`08-architecture.md` §6.7 et ADR-010 §8 définissent `POST /account/delete`, `GET /account/export` et `POST /consents/:code/revoke`. **Aucune des trois n'est implémentée** (`git ls-files` sur `app/api/v1/**`).

Conséquence : `public.erase_account(uuid)` — la pièce maîtresse de la conformité art. 17, avec sa dérogation d'immuabilité et sa pseudonymisation de `consents` — n'est référencée que par `packages/db/src/__tests__/integration/support/test-clients.ts` (nettoyage de fixtures). Aucun chemin applicatif. Idem pour le retrait de consentement : `POST /api/v1/consents` refuse explicitement `granted: false` en renvoyant vers une route qui n'existe pas :

```ts
// apps/web/app/api/v1/consents/route.ts
if (!parsed.data.granted) {
  return apiError(400, "VALIDATION_FAILED", "Le retrait de consentement passe par POST /api/v1/consents/:code/revoke.");
}
```

Sur un produit qui traite des données de santé (art. 9 RGPD) avec consentement comme base légale, l'impossibilité de retirer ce consentement, d'exporter et d'effacer ses données est bloquante avant toute mise en ligne. Les policies `has_active_consent()` sur `session_logs`/`athlete_profiles`/`body_metrics`/`nutrition_checkins`/`risk_flags` sont correctes mais ne peuvent jamais basculer en mode « retiré » puisque rien n'écrit `granted = false`.

À corriger : implémenter les 3 routes + le « mode dégradé explicite » côté UI (question ouverte n°4 de `08-architecture.md` §12).

---

### B2 — La progression du plan est structurellement gelée : le coach ne fait jamais progresser personne

Trois faits qui se composent :

1. `athlete_profiles.data_regime` a pour défaut `'cold'` et **n'est écrit par aucun code**. Vérifié par grep exhaustif : seules des lectures existent (`build-planning-context.ts:241`). Le commentaire de migration dit « piloté serveur » — le serveur ne le pilote jamais.
2. `computeBaselineWeeklyLoad()` ignore l'historique réel dès lors que le régime est `cold` :
```ts
// packages/rules-engine/src/pipeline/06-compute-weekly-load-target.ts:55
if (context.dataRegime !== "cold" && context.history.completedWeeks.length > 0) { … }
// sinon : baseline = declaredWeeklyHours × 36
```
3. L'étape 6 réapplique `cold_start_volume_ratio` à la **semaine 0 de chaque run**, pas seulement au premier :
```ts
if (i === 0 && context.dataRegime === "cold") {
  proposedAfter = Math.round(baselineWeeklyLoad * ratio);   // 0.7 × baseline
```

Résultat : **chaque révision hebdomadaire (et chaque ajustement quotidien) régénère un plan calé au volume de démarrage prudent**, recalculé à partir des heures déclarées à l'onboarding. Le plan de la semaine 12 est identique à celui de la semaine 1. La clause d'asymétrie AC4 masque le symptôme (elle empêche la trace `increase`), les property tests ne l'attrapent pas (ils ne comparent que des semaines à l'intérieur d'un même draft).

Impact : AC1 (« progresser »), AC5 (le diff hebdo n'aura structurellement rien à montrer), AC6 (la stagnation détectée sera causée par le moteur lui-même), AC8 (le plafond de progression n'a jamais l'occasion de s'appliquer entre deux versions). C'est la promesse produit centrale qui ne fonctionne pas.

À corriger : faire basculer `data_regime` vers `'declared'` dès qu'il existe des `completedWeeks`, et n'appliquer `cold_start_volume_ratio` qu'au trigger `onboarding` — pas à toute semaine d'index 0.

---

### B3 — ADR-007 / risque R2 : le refus de démarrage sur garde-fou `null` est du code mort

`ProductionRulesetParamsSchema` et `isProductionReady()` sont soigneusement écrits et unit-testés… et **ne sont appelés par aucun code applicatif** (grep : uniquement `packages/domain/src/__tests__/ruleset.test.ts`). Le seul point de lecture réel utilise le schéma permissif :

```ts
// apps/web/lib/orchestration/get-active-ruleset.ts
return RulesetSchema.parse({ version: data.version, params: data.params, … });
```

Or `0010_seed_referentials.sql` insère `0.1.0-dev` avec `cold_start_volume_ratio: null`, `interference.*: null`, `pain_protocol.*: null`, `nutrition.*: null` — ces valeurs ne sont complétées que par `supabase/seed.sql`, **jamais rejoué en production** (garantie assumée et correcte par ailleurs).

Donc en production, avec le ruleset actuel : `generatePlan()` lève sur `requireNonNull("guardrails.cold_start_volume_ratio")` dès la première génération, et surtout `evaluatePainProtocol()` lève sur `pain_protocol.persistent_signal_threshold` — le protocole douleur AC9 est inopérant. Les deux se manifestent en 500 opaque, pas en refus de démarrage explicite.

C'est exactement le risque R2 du plan (« Critique — sécurité utilisateur ») dont la mitigation était censée être ce schéma. À corriger : appeler `ProductionRulesetParamsSchema` dans `getActiveRuleset()` quand `NODE_ENV === 'production'`, et étendre le blocage aux paramètres `pain_protocol.*` et `nutrition.*` (ce sont aussi des garde-fous de sécurité, même s'ils ne portent pas le préfixe `guardrails.`).

---

### B4 — AC13 : on facture (Stripe réel) un contenu premium qui n'existe pas

`08-architecture.md` §6.3 et le plan §2 listent `GET /plan/week` et `GET /plan/macro` comme les deux routes premium. **Ni l'une ni l'autre n'est implémentée.** Le seul contenu débloqué par `canViewWeek` est :

```tsx
// apps/web/components/dashboard/weekly-preview-card.tsx
<p>La vue complète de ta semaine (planning détaillé, vision macro) arrive avec la révision hebdomadaire.</p>
```

AC13 promet explicitement « la vue semaine complète, la vision macro par blocs, des ajustements automatiques illimités ». L'abonné obtient en pratique : l'accès quotidien illimité + `/plan/reviews/latest`. Les blocs macro sont pourtant matérialisés en base (`plan_blocks`) — il ne manque que l'exposition.

Argent réel en jeu via `sk_live` : ne pas ouvrir commercialement sans livrer ces deux vues, ou sans réécrire la promesse de l'écran Abonnement.

---

### B5 — Le plafond de coût LLM de l'onboarding est contournable par le client

`MAX_TURNS_PER_SESSION = 60` est la seule protection sur la route la plus coûteuse du produit. Elle s'appuie sur `onboarding_sessions.turn_count`, une colonne que le client peut réécrire directement :

```sql
-- supabase/migrations/0004_onboarding.sql
create policy "onboarding_sessions_own" on onboarding_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update on onboarding_sessions to authenticated;   -- pleine largeur
```

Le commentaire justifie le GRANT pleine largeur par « `profile_draft` est un BROUILLON sans autorité » — vrai pour `profile_draft`, faux pour `turn_count`, qui est un compteur de sécurité. Un `UPDATE onboarding_sessions SET turn_count = 0` via le client anon (RLS le permet) rend le quota illimité. Aucun autre rate limiting n'existe : `08-architecture.md` §8 en exige aussi sur `/billing/subscription-intent` (absent, documenté comme tel dans l'en-tête de la route).

À corriger : GRANT colonne `update (profile_draft)` uniquement, `turn_count`/`current_step`/`status` réservés au `service_role` (les routes les écrivent déjà via le client RLS — à basculer sur `admin`).

---

### B6 — AC3 : le profil à risque est détecté, tracé… puis sans aucun effet

`resolveRiskRestrictions()` produit deux drapeaux. `blockCalorieDeficit` est bien consommé par l'étape 10 (nutrition). **`requiresMedicalClearance` (pathologie déclarée, mineur) n'est lu nulle part** — grep exhaustif : uniquement son affectation dans `01-resolve-risk-restrictions.ts`.

AC3 exige que « si un profil à risque est détecté, le coach IA adapte son comportement (limitation des recommandations, orientation vers un professionnel de santé, ou blocage de la génération de plan nutritionnel avec déficit) plutôt que de poursuivre un onboarding standard ». Pour `pathology` et `minor`, le comportement est aujourd'hui strictement identique à un onboarding standard, à une ligne de `decision_traces` près, invisible de l'utilisateur.

Second angle du même AC : `athlete_profiles.birth_date` est commentée « santé/AC3 (détection mineur) » mais **aucun code ne calcule l'âge**. La détection du profil mineur repose entièrement sur le fait que l'utilisateur (ou le LLM) coche lui-même `flagType: 'minor'` dans `confirmedProfile.riskFlags`. La question ouverte n°3 d'architecture (« mineur : refus d'inscription ou parcours dégradé ? ») reste non tranchée — mais en l'état, c'est « parcours strictement normal ».

Enjeu légal/éthique explicitement listé en contrainte de la fiche §5.

---

## 🟡 Importants

### I1 — Webhook Stripe : le fail-closed est correct, mais le chemin vérifié n'est jamais testé

Point d'attention n°1 du developer : **vérifié et conforme**. `verifyAndParseEvent()` n'a aucun chemin où une signature serait acceptée sans vérification en production — secret présent ⟹ `constructEvent()` obligatoire (et `400` si l'en-tête manque) ; secret absent + `NODE_ENV === 'production'` ⟹ `503` avant toute lecture ; secret absent hors prod ⟹ parse brut avec log bruyant. Bien fait.

Deux réserves :
- Le **seul** test qui exerce ce webhook (`subscribe.spec.ts` via `postWebhookFixture`) passe par la branche dev sans signature. `stripe.webhooks.constructEvent()` n'est donc jamais exercé : une régression sur ce chemin (mauvais `rawBody`, mauvais ordre d'`await`) ne serait détectée qu'en production, sur de l'argent réel.
- Sur Vercel, `NODE_ENV === 'production'` vaut aussi pour les déploiements **preview**. C'est le sens prudent, mais cela signifie qu'un preview sans `STRIPE_WEBHOOK_SECRET` répondra `503` — à documenter pour `devops`.

### I2 — `isStaleForSubscription()` : la limitation est réelle, pas seulement théorique

Point d'attention n°3 : **c'est une faille de correction, pas seulement de volumétrie.** La requête relit les 50 derniers événements **tous abonnements confondus** :

```ts
.not("processed_at", "is", null).order("event_created", { ascending: false }).limit(50)
```

Avec quelques dizaines d'utilisateurs actifs, l'événement précédent d'un abonnement donné sort de la fenêtre en quelques heures : la fonction renvoie alors `false` (« pas obsolète ») et un événement réellement plus ancien est appliqué. Ce n'est pas « un souci au-delà de quelques dizaines de milliers d'événements », c'est un souci dès la première dizaine d'utilisateurs — la dégradation est silencieuse et se traduit par un `tier` incorrect.

Ajout : la lecture et l'écriture ne sont pas atomiques, deux livraisons concurrentes du même abonnement peuvent s'écraser. Correctif peu coûteux : comparer `event.created` à `subscriptions.updated_at` (ou ajouter une colonne `last_event_created` sur `subscriptions`) plutôt que de scanner `stripe_events`.

### I3 — Rétention `stripe_events` : confirmé non couvert, aucune purge

Confirmé conforme au constat de `08-architecture.md` ligne 302 : `stripe_events` n'a pas de `user_id`, `erase_account()` ne la touche pas, et **aucun job de purge n'existe**. Le `payload` complet (dont l'e-mail de facturation) survit indéfiniment à la suppression du compte. C'est une non-conformité art. 17 assumée dans les docs mais non traitée dans le code — bloquante pour l'ouverture commerciale (dixit la question ouverte n°9). Idem pour la rétention 5 ans de `consents` : décidée, jamais implémentée.

### I4 — `enqueueWeeklyReviews()` : pagination absente et fenêtre horaire sans rattrapage

```ts
const { data: profiles } = await admin.from("profiles").select("id, timezone");
```
Aucune pagination : PostgREST plafonne par défaut à 1000 lignes. **Au-delà de 1000 comptes, une partie des utilisateurs n'est jamais enrôlée**, sans aucun signal. À corriger avant toute croissance.

Second point : `clock.hour !== WEEKLY_REVIEW_LOCAL_HOUR` est une égalité stricte. Les crons Vercel n'ont aucune garantie d'exécution à la minute ; une invocation manquée = une révision hebdomadaire perdue pour tout un fuseau, sans rattrapage. Une fenêtre `hour >= 18` combinée à l'idempotence par `isoWeek` (déjà en place) serait plus robuste.

### I5 — Absence de transaction + index d'idempotence = job hebdomadaire perdu définitivement après un échec partiel

`materializePlanVersion()` documente honnêtement l'absence de transaction. Combinée à `plan_versions_idempotency (plan_id, input_snapshot_hash, ruleset_version)`, elle produit un piège : si le run échoue **après** l'insertion de `plan_versions` (LLM lent, erreur sur `explanations`, `plan_diffs`…), le rejeu du job recalcule exactement le même `input_snapshot_hash` → violation `23505` → échec → back-off → `abandoned` après 5 tentatives. La révision de la semaine est définitivement perdue, avec des lignes orphelines et `engine_runs.status = 'running'`.

Ce chemin est d'autant plus probable que `renderExplanationForTraces` est appelé une fois par séance détaillée **et** par jour de nutrition, en parallèle, avec un fournisseur réseau.

### I6 — `GET /progress/diagnosis` écrit en base et appelle le LLM à chaque requête

Route `GET` non idempotente : elle insère `engine_runs` + `decision_traces` + `explanations` et déclenche un appel LLM à chaque rafraîchissement, sans quota (elle n'appelle ni `requireEntitlement()` ni `getEntitlement()`). Vecteur de coût et de gonflement de tables. De plus :

```ts
subject_id: randomUUID(), // aucune ligne `stagnation_diagnoses` persistée à ce lot
```
crée des `explanations` pointant vers une entité inexistante — bruit d'audit permanent.

### I7 — `body-metrics` absente : toutes les cibles caloriques sont calculées sur 70 kg

`POST /api/v1/body-metrics` (plan §2, `08-architecture.md` §6.4) n'est pas implémentée et aucune UI ne saisit le poids. Conséquence directe dans le moteur :

```ts
// packages/rules-engine/src/pipeline/10-build-nutrition-days.ts
const DEFAULT_WEIGHT_KG = 70;
function latestWeightKg(context) { … if (withWeight.length === 0) return DEFAULT_WEIGHT_KG; }
```

**100 % des utilisateurs reçoivent des kcal, protéines, glucides et lipides calculés sur un poids fictif de 70 kg.** Le plancher `kcal_safety_floor` protège le côté bas, donc pas de danger aigu, mais AC11 (« cibles personnalisées ») n'est pas satisfait et les recommandations sont fausses pour la majorité des profils. `athlete_profiles` ne porte pas de poids non plus (seulement `height_cm`).

### I8 — AC14 : le chemin « définir un nouvel objectif » échoue en 500

`/objectif/fin` renvoie l'utilisateur vers `/onboarding/chat`. Mais `completeOnboarding()` fait un `insert()` (et non `upsert`) sur `athlete_profiles` (PK `user_id`) et sur `athlete_sports` (`unique (user_id, sport_id)`) — le choix est documenté et justifié pour le premier onboarding, mais rend le second structurellement impossible :

```ts
// commentaire du fichier : « `/complete` n'est de toute façon appelée qu'une fois par utilisateur »
```
…ce que AC14 contredit. Et même en corrigeant l'insert, `materializePlanVersion()` réutilise le plan actif existant sans mettre à jour `plans.objective_id` : le nouveau plan resterait rattaché à l'ancien objectif. La moitié de AC14 (l'option « nouvel objectif ») n'est pas fonctionnelle. La route `POST /objectives/transition` de `08-architecture.md` §6.2 est également absente.

### I9 — Paywall : la saisie n'est pas réellement accessible quand le quota est épuisé

ADR-008 §5 et AC13 posent que la saisie quotidienne reste accessible hors quota. C'est vrai au niveau API (`POST /session-logs` ne consomme rien — bien vu) mais **faux dans l'UI** : `/aujourdhui` bloqué renvoie « la saisie reste accessible depuis ton Dashboard », et `/dashboard` bloqué n'affiche pas non plus `DailyLogForm`. L'utilisateur n'a aucun moyen de saisir. `paywall.spec.ts` ne teste que l'API — le test passe alors que la promesse n'est pas tenue.

### I10 — `resolveOrCreateSport()` : le client alimente un référentiel partagé

Un `sportCode` arbitraire (`z.string().min(1)`, sans borne haute ni charset) fourni dans `confirmedProfile` est inséré en `service_role` dans `sports`, table lisible par **tous** les `authenticated` (`sports_read … using (true)`). Un utilisateur peut donc créer un nombre non borné de lignes de contenu arbitraire visibles par tous les autres. C'est le seul endroit du code où une donnée client franchit la frontière « référentiel partagé ». À borner (longueur, `^[a-z0-9_-]+$`, plafond par utilisateur) ou à passer en file de modération.

### I11 — `has_active_consent()` est interrogeable pour n'importe quel `user_id`

`security definer`, `grant execute … to authenticated`, aucun contrôle sur `p_user`. Un utilisateur authentifié peut appeler `rpc('has_active_consent', { p_user: <uuid d'autrui>, p_code: 'health_data_processing' })` et apprendre l'état de consentement d'un tiers. Fuite d'information faible mais elle contourne par construction tout le modèle RLS. Correctif : `if p_user <> auth.uid() and not is_staff() then raise …`, ou restreindre l'`EXECUTE` au `service_role` (les policies l'appellent en interne, pas via le rôle appelant).

### I12 — Repli LLM silencieux **y compris en production**

```ts
// apps/web/lib/coach-llm-provider.ts
const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.warn("[coach-llm] MISTRAL_API_KEY absente — repli sur le mock déterministe (dégradé, hors production).");
  return new DeterministicMockLlmProvider();
}
```
Le commentaire dit « hors production », le code ne teste jamais `NODE_ENV`. En production sans clé, des réponses **scriptées** seraient servies comme conversation de coaching et comme explications. Contraste frappant avec le webhook Stripe, qui lui fait bien le fail-closed. Même traitement à appliquer.

### I13 — Couverture de tests : trou complet sur L4 et L5

- **Zéro test unitaire ou d'intégration dans `apps/web`** — `"test": "vitest run --passWithNoTests"`. Toute la couche d'orchestration (entitlements, webhook, job queue, `applyDailyLog`, `runWeeklyReview`, `runObjectiveCheck`) n'a aucun test hors E2E.
- **9 des 13 tests d'intégration du plan §4.3 sont absents** : `onboarding-complete`, `session-log-adjustment`, `paywall`, `free-access-idempotency`, `entitlement-unlock`, `stripe-webhook-idempotency`, `weekly-review-job`, `weekly-review-llm-failure`, `progress-calibration`. Seuls les 4 tests de schéma (RLS, coverage, health-consent, immutability) existent — ceux-là sont excellents.
- Les 10 specs Playwright exigent Supabase local **et** des clés Stripe test réelles (`subscribe.spec.ts` fait de vrais appels à l'API Stripe) : non exécutables dans un pipeline CI standard, donc en pratique non régressives.

Les objectifs du plan (« 70 % global, 90 % sur `rules-engine` ») sont probablement tenus sur le moteur (21 fichiers de test, property-based inclus) et très loin du compte sur L4/L5, qui sont précisément les lots qui manipulent argent et données de santé.

---

## 🟢 Nice-to-have

- **`hasAcuteZone` est du code mort** (`02-resolve-pain-state.ts`) : la distinction AC9 niveau 2 / niveau 3 ne se traduit dans le plan que par les mêmes groupes musculaires bloqués. Seul le message de `PAIN_REFERRAL_MESSAGES` diffère — correct et bien isolé du LLM (bon point), mais la promesse « aucune alternative d'auto-adaptation » repose uniquement sur le texte, pas sur le plan (la séance est convertie en `mobility`, ce qui *est* une auto-adaptation).
- **`risk_flags.notes` silencieusement jeté** : `ConfirmedRiskFlagSchema` documente « c'est la route `/complete` qui le chiffre (`notes_enc`, pgcrypto) », ce que `complete-onboarding.ts` contredit explicitement. Corriger le commentaire du schéma.
- **Point d'attention n°4 (Web Push) : vérifié, rien de cassé.** `sendWebPushToUser()` sort proprement en `{ sent: 0 }` sans souscription, `notifyUser()` avale l'erreur, la ligne `in_app` reste la garantie dure. Manquent seulement l'UI d'abonnement, `sw.js` et l'exposition de `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Point d'attention n°2 (cron GET+POST) : vérifié, conforme.** Les deux méthodes pointent sur le même `handle`, la garde `isAuthorizedCronRequest()` est appliquée identiquement et fail-closed si `CRON_SECRET` est absente. RAS.
- **Point d'attention n°5 (`session-logs` PATCH) : vérifié, aucun appelant.** Aucun code client n'émet de PATCH. À noter l'asymétrie non documentée côté produit : `nutrition-checkins` supporte de facto la correction (update si existant), `session_logs` non — une saisie erronée est définitive.
- `notifyUser()` interpole `title`/`body` (texte LLM) dans du HTML d'e-mail sans échappement.
- `readObjectiveEndOffer()` déclenche un appel LLM à chaque affichage de `/objectif/fin`.
- Duplication assumée des seuils RPE/fraîcheur entre `apply-daily-log.ts` et `guardrail-helpers.ts` : bien argumentée, mais deux constantes de sécurité à maintenir en phase sans test qui l'impose.
- Aucun en-tête de sécurité (`CSP`, `X-Frame-Options`, `Referrer-Policy`) dans `next.config.ts`.
- `explanations` orphelines : `subject_id` de `plan_diff_item` pointe sur `planVersionId` et non sur l'item.
- E2E : `today-in-timezone` / `addDaysIso` re-dupliqués dans `e2e/support`.

---

## Ce qui est solide et mérite d'être conservé tel quel

- Le modèle de privilèges ADR-012 (GRANT colonne, `UPDATE` jamais par défaut) et sa vérification par `rls-coverage.test.ts` / `rls.test.ts` / `immutability.test.ts` — c'est le meilleur du dépôt.
- `applyHardGuardrails` en étape terminale + `assertEveryNumberIsTraced` + les deux property tests (200 runs, avec et sans plan précédent).
- `checkNumericIntegrity` à tolérance nulle avec neutralisation des dates, et le repli template systématique.
- `PAIN_REFERRAL_MESSAGES` : texte fixe, jamais LLM, avec la justification exacte de pourquoi le mot « adaptation » est interdit au niveau 3.
- Le fail-closed du webhook Stripe et de `require-cron-secret`.
- `isSafeRedirectPath` (antislash + caractères C0) — traitement complet du vecteur open-redirect.

---

## Ordre de correction recommandé

1. **B1** (routes RGPD) et **B3** (garde-fous bloquants en prod) — prérequis légaux/sécurité avant toute donnée réelle.
2. **B2** (progression gelée) — sans lui, le produit ne fait pas ce qu'il promet.
3. **B5**, **I11**, **I10** — corrections de surface d'attaque, peu coûteuses.
4. **B6**, **I7** — conformité AC3/AC11 sur données de santé.
5. **B4**, **I8**, **I9** — conformité AC13/AC14 avant ouverture commerciale.
6. **I2**, **I3**, **I4**, **I5** — robustesse Stripe et jobs.
7. **I13** — tests d'intégration L4/L5, en priorité `stripe-webhook-idempotency`, `entitlement-unlock`, `paywall`, `weekly-review-job`.
