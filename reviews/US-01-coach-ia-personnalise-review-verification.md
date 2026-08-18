# Contre-revue des corrections — US-01 « Coach IA personnalisé »

Branche `feature/US-01-coach-ia-personnalise` · HEAD `3f309fb` · périmètre : 12 commits (`be2ab8c`..`3f309fb`)

**Vérifications exécutées** : `pnpm lint` (OK), `pnpm typecheck` (OK), `pnpm test` (OK, 5/5 paquets), `pnpm build` (OK), `supabase db reset` (13 migrations appliquées, OK), tests d'intégration `apps/web` et `packages/db`, plus 5 harnais de vérification indépendants écrits hors dépôt (moteur, schéma production, second onboarding, quota). Aucun fichier du dépôt modifié.

---

## Bloquants

### B2 — RÉGRESSION INTRODUITE (bloquant)

La correction fait bien ce qu'elle annonce, mais ouvre une brèche dans le garde-fou AC8.

Ce qui est correct : `cold_start_volume_ratio` n'est plus réappliqué sur `weekly_review`/`negative_signal`/`pain_protocol` (vérifié : trace `guardrails.cold_start_volume_ratio` absente quand `previousPlan != null`), la condition `previousPlan === null` couvre bien le plan négocié AC2, et `data_regime` est persisté en base par `runWeeklyReview()` via le client `service_role`.

Le problème : rien ne plafonne la progression entre deux versions de plan. `applyHardGuardrails` (étape 11) ne compare que la semaine `i` à la semaine `i-1` *du même draft* (`11-apply-hard-guardrails.ts:56` — la boucle démarre à `i = 1`) ; la semaine d'index 0 n'a aucun antécédent intra-draft. L'unique garde inter-version de l'étape 6 est `allowIncrease`, qui vaut `true` pour `weekly_review` — et qui autorise alors une hausse non bornée.

Avant la correction, la semaine 0 était figée à `0.7 × baseline` à chaque run : plan gelé (le bug), mais sûr. Après, mesuré sur les fixtures du moteur :

```
semaine     | v1 onboarding | v2 weekly_review (cold) | v3 weekly_review (declared)
2026-08-10  | 185 min       | 265 min (+43 %)         | 490 min (+165 %)
2026-08-17  | 205 min       | 290 min (+41 %)         | 540 min (+163 %)
```

Le plafond `weekly_load_progression_cap_pct` du ruleset vaut 10 %. Un utilisateur qui n'a rien logué de sa semaine passe de 185 à 265 min du jour au lendemain. Avec `data_regime = 'declared'` et un historique réel, le saut atteint +165 %. C'est le risque blessure — la promesse produit centrale — inversé : on est passé de « ne progresse jamais » à « peut tripler la charge en une nuit ».

Correctif attendu : borner `after` par rapport à `before` (valeur de la version précédente pour la même `weekStart`) avec `weekly_load_progression_cap_pct`, ou étendre l'étape 11 à une comparaison contre `context.previousPlan`.

Aggravant : aucun test n'a été ajouté pour B2. Ni `cold-start.test.ts`, ni `weekly-review-job.test.ts` n'assertent quoi que ce soit sur ce point.

### B1 — CONFIRMÉ CORRIGÉ

Les 3 routes existent réellement et ferment la chaîne. `POST /account/delete` appelle `erase_account(p_user)` en `service_role`. `POST /consents/:code/revoke` insère une nouvelle ligne `granted = false` (jamais un `UPDATE`) et purge les 5 tables de saisie santé. Mode dégradé explicité par `DegradedModeBanner`.

Réserve (interaction B1 × B6, voir plus bas) : la purge inclut `risk_flags`.

### B3 — CONFIRMÉ CORRIGÉ (vérifié empiriquement)

`getActiveRuleset()` est le seul point de lecture applicatif de `rulesets` en production. `ProductionRulesetParamsSchema` exécuté sur le ruleset `0.1.0-dev` brut (état de production) → rejeté sur les 11 paramètres attendus. Après `seed.sql` → accepté. Protection réelle, non contournable par accident.

### B4 — CONFIRMÉ CORRIGÉ

`GET /plan/week` et `GET /plan/macro` existent, gardées par `getEntitlement()` sans consommer d'accès libre, `WeeklyPreviewCard` affiche le contenu réel.

### B5 — CONFIRMÉ CORRIGÉ (vérifié en base)

`information_schema.column_privileges` confirme : une seule ligne, `profile_draft | UPDATE` pour `authenticated` sur `onboarding_sessions`. `turn_count`/`current_step`/`status` ne sont plus réécrivables par le client. Les 5 sites d'écriture vérifient la propriété via RLS avant l'update admin.

### B6 — CORRIGÉ dans la limite déclarée

Texte fixe (jamais LLM), exposé hors paywall. Deux réserves :
- `resolveRiskRestrictions().requiresMedicalClearance` reste du code mort : l'UI redérive depuis `risk_flags` au lieu de consommer le drapeau du moteur.
- Interaction avec B1 : `POST /consents/:code/revoke` purge `risk_flags`. Un utilisateur mineur ou pathologique qui retire son consentement santé perd l'avertissement médical, tout en gardant l'accès à son plan.

---

## Importants

| Item | Statut | Preuve / réserve |
|---|---|---|
| I1 | Confirmé (aucune action) | Réserve d'origine subsiste : `stripe.webhooks.constructEvent()` toujours jamais exercé par un test. |
| I2 | Confirmé corrigé | `last_event_created` remplace le scan des 50 derniers événements. Écriture atomique ; lecture reste check-then-act (documenté). |
| I3 | Confirmé corrigé (partiel) | Purge `stripe_events` faite. Non fait : rétention 5 ans de `consents`. |
| I4 | Confirmé corrigé | Pagination + fenêtre `hour >= 18`, idempotence isoWeek préservée. |
| I5 | Partiel, comme déclaré | `.then(ok, err)` sur builder PostgREST : le `console.error` de secours est du code mort en pratique. |
| I6 | Corrigé, deux réserves | (a) paywall `canViewWeek` ajouté sur `/progress/diagnosis` non fondé sur AC13/AC7 ; (b) rejeu le même jour crée des orphelins `engine_runs`/`explanations` avant l'upsert ignoré. |
| I7 | Confirmé corrigé | Route + UI, idempotence 23505, RLS → 403. |
| I8 | Confirmé corrigé (vérifié empiriquement) | Second/troisième onboarding réussissent réellement, `plans.objective_id` bascule, pas de doublon. Absence de `POST /objectives/transition` défendable. |
| I9 | Confirmé corrigé | `DailyLogForm` rendu dans la branche bloquée des deux écrans. |
| I10 | Confirmé corrigé | `SportCodeSchema` + garde en profondeur. |
| I11 | Confirmé corrigé | Restriction `p_user = auth.uid() or is_staff()`, aucun appelant légitime cassé. |
| I12 | **CORRECTIF INCOMPLET** | L'échappatoire `COACH_LLM_PROVIDER === "mock"` est évaluée AVANT le garde `NODE_ENV === "production"`. Une variable d'env mal placée en prod sert des réponses scriptées sans erreur ni log distinctif. Correction triviale : inverser l'ordre des gardes. |
| I13 | Partiel + réserve | Les 4 tests commités sont substantiels (contrôles négatifs réels). Réserve : `apps/web` a une config vitest séparée non branchée sur `pnpm test`/turbo — non régressive dans le pipeline par défaut. B2 n'est couvert par aucun test. |

---

## Constats hors périmètre des findings originaux

**N1 [IMPORTANT] — Le compteur de quota d'accès libre sur-compte** (défaut pré-existant, non introduit par ces commits). `entitlements.ts:129` compte `now` sans vérifier qu'il figure déjà dans `events`. Deux chargements de page le même jour affichent "2 accès utilisés" pour 1 jour réellement consommé. Aucun blocage à tort, mais pression à l'abonnement injustifiée.

**N2 [MINEUR]** — Tests non commités en échec dans l'arbre de travail au moment de l'audit (travail en cours en parallèle) : `free-access-idempotency.test.ts` (expose N1) et `session-log-adjustment.test.ts` (oubli de fixture `grantHealthConsents()`).

**N3 [MINEUR]** — En-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy) toujours absents malgré 5 nouvelles routes publiques.

---

## Verdict

**CORRECTIONS REQUISES.**

16 des 19 findings sont réellement fermés. Mais deux points bloquent :

1. **B2 introduit une régression de sécurité utilisateur** : hausse mesurée de +43% à +165% du volume réel d'entraînement en une seule révision hebdomadaire, sans plafond. Plus dangereux que le bug d'origine. Doit être corrigé avant toute mise en ligne, avec un test de non-régression comparant deux versions successives.
2. **I12 reste ouvert** : l'échappatoire `COACH_LLM_PROVIDER=mock` court-circuite le fail-closed production. Correction triviale : déplacer le garde `NODE_ENV === "production"` avant.

À traiter dans la foulée : interaction B1×B6 (purge de `risk_flags` efface l'avertissement médical), paywall non fondé sur `/progress/diagnosis` (I6), N1 (compteur de quota), branchement de `test:integration` sur le pipeline par défaut.
