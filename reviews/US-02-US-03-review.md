# Revue de code — F2 (US-02) + F3 (US-03)
Commits audités : `58c61e2`, `aaba499` (diff `948c513..HEAD`)

## Vérifications exécutées

| Commande | Résultat |
|---|---|
| `pnpm typecheck` | ✅ EXIT 0 |
| `pnpm lint` | ✅ 5/5 packages, `--max-warnings=0` |
| `pnpm test` | ❌ **EXIT 1** — 2 suites en échec |

Le rapport du développeur est contredit sur ce point : **la suite de tests est rouge**.

---

## 🔴 Bloquants

### B1 — `erase_account()` est cassée : le droit à l'effacement RGPD (art. 17) échoue
`supabase/migrations/0024_session_placements.sql:236-256`

Le trigger `availability_slots_refresh_placements` (`after insert or update or delete`) insère dans `job_queue` une ligne portant `user_id`. Or `erase_account()` fait `delete from auth.users where id = p_user` (`0002_identity_consents.sql:145`), ce qui cascade sur `availability_slots` — le trigger `AFTER DELETE` se déclenche alors et tente d'insérer un job référençant un utilisateur **déjà supprimé** :

```
error: insert or update on table "job_queue" violates foreign key constraint "job_queue_user_id_fkey"
```

Reproduit en exécution (c'est ce qui fait planter la suite `rls.test.ts` au teardown). Portée réelle : **tout utilisateur ayant complété l'onboarding possède des `availability_slots`**, donc la suppression de compte échoue pour la quasi-totalité de la base. Régression directe sur ADR-010 §8 et sur les tests T1/T2/T30/T41 documentés.

Piste : neutraliser le trigger pendant l'effacement (le GUC `app.erasure_user_id` existe déjà et est posé en `set local` par `erase_account()` — un `if current_setting('app.erasure_user_id', true) is not null then return coalesce(new, old); end if;` en tête de `enqueue_placement_refresh()` suffit), ou rendre le trigger insensible aux `DELETE` en cascade.

### B2 — `pnpm test` est rouge : `data_connection_secrets` non déclarée dans le garde-fou RLS
`packages/db/src/__tests__/integration/rls-coverage.test.ts:10`

```
AssertionError: Tables sans policy explicite (hors service_role) : data_connection_secrets
```

Le schéma est **correct** (ADR-013 §2 exige justement l'absence de policy), mais l'allow-list du test n'a pas été mise à jour :

```ts
const SERVICE_ROLE_ONLY_TABLES = new Set(["stripe_events", "job_queue"]);
```

Double conséquence : la CI est rouge, et surtout la table la plus sensible du lot (jetons OAuth) **n'est couverte par aucune assertion** — ni son RLS, ni son inaccessibilité au client ne sont vérifiés. Ajouter `data_connection_secrets` à l'ensemble rétablit les deux.

### B3 — Crash au rendu de `/planning` sur un `not_done` déclaré manuellement
`apps/web/components/planning/session-card.tsx:68-73`

```tsx
const isNotDone = session.log?.completion === "not_done";
const status = placement?.status ?? "scheduled";
...
) : status === "moved" || isNotDone ? (
  <PlacementChange originLabel={formatOriginLabel(placement!.origin!.date, placement!.origin!.time)} ... />
```

`toSessionPlacementView()` (`read-session-placements.ts:95`) pose explicitement `origin: row.status === "scheduled" ? null : {...}`. Donc dès que `isNotDone` est vrai avec un placement `scheduled`, `placement!.origin!.date` déréférence `null` → `TypeError` côté client. Même crash si `placement` est `null`, alors que `TodaySessionView.placement` est documenté comme « jamais un état d'erreur, jamais bloquant pour l'affichage » (`packages/domain/src/onboarding.ts:218-224`).

Scénario nominal déclenchant : l'utilisateur répond « Non » à « Tu as fait la séance ? » sur `/aujourdhui`, puis ouvre `/planning`.

### B4 — Discriminant `not_done` approximé : la carte accuse à tort une saisie manuelle
`apps/web/components/planning/session-card.tsx:38-41` (simplification assumée en commentaire) et `:48`

L'état (d) est dérivé de `session.log?.completion === 'not_done'` seul. Conséquences concrètes, toutes vérifiées sur le code :

- un `not_done` **saisi par l'utilisateur** (sans aucun imprévu signalé) affiche le badge « non réalisée » et la phrase **« Je l'ai comptée comme non réalisée après ton imprévu. »** (`:91`) — le coach s'attribue une déduction qu'il n'a jamais faite, sur une déclaration que l'utilisateur a faite lui-même. C'est exactement ce que le test **T47** (`docs/db-schema.md`) et le design §3.1 interdisent ;
- le bouton « Signaler un imprévu » est retiré (`:94`) sur une séance parfaitement signalable ;
- c'est aussi la cause immédiate de **B3**.

À noter : `readNotDoneNotices()` (`apps/web/lib/planning/read-notdone-notices.ts:31-38`) utilise, lui, le prédicat **exact** d'ADR-017 §8 (`schedule_incidents.closeout_outcome = 'log_created'` + `resulting_session_log_id`). L'approximation ne concerne donc que le chemin Planning. Le correctif consiste à propager ce même prédicat via `fetchTodaySessionView()` (un champ booléen sur `SessionPlacementView` ou une jointure dédiée), comme le commentaire du fichier l'anticipe. Le risque soulevé dans la commande d'audit est donc **confirmé et non théorique**.

### B5 — Les trois tests d'architecture qui figent les invariants n'existent pas
Confirmé par inspection de `packages/rules-engine/src/__tests__/` et recherche globale :

| Test attendu | Source | État |
|---|---|---|
| `no-connection-dependency.test.ts` | `08-architecture.md` §13.1 (AC9) | ❌ absent |
| `placement-never-writes-plan-tables.test.ts` | §14.1 | ❌ absent |
| `placement-output-has-no-content.test.ts` | §14.1 | ❌ absent |
| `hybrid-score-not-in-pipeline.test.ts` | cité en en-tête de `compute-hybrid-score.ts:7` | ❌ absent |

**Évaluation du risque réel** — j'ai vérifié les invariants à la main, et ils sont **actuellement respectés** :
- aucun fichier de `apps/web/lib/orchestration/` ni de `packages/rules-engine/src/` ne référence `data_connections` / `sync_runs` / `hybrid_scores` (AC9 tenu) ;
- `apps/web/lib/planning/**` n'importe ni `materializePlanVersion` ni `regeneratePlan`, ne lit `planned_sessions`/`plans` qu'en `select`, et n'écrit que dans `session_placements`, `schedule_incidents` et `session_logs` (l'écriture sanctionnée par ADR-017).

Le risque n'est donc pas une violation présente mais une **absence de cliquet** : ce sont précisément les deux frontières que le projet a désignées comme non négociables (F1 ↛ F2, F3 ↛ moteur), et `placement-never-changes-content.property.test.ts` — qui existe — teste la *stabilité du contenu en sortie d'algorithme*, pas l'*absence d'écriture en base*. Il ne couvre pas l'invariant. La lacune signalée par le développeur est réelle et doit être comblée avant merge.

### B6 — Les 31 tests de schéma T17→T47 ne sont pas écrits
`git diff --stat 948c513..HEAD -- packages/db` : **aucun fichier de test ajouté ou modifié**. `docs/db-schema.md` §« Tests attendus » spécifie pourtant nommément T17 à T47 pour ce périmètre. Non couverts, entre autres :

- **T20/T21** — `enforce_connected_source_consents()` refuse un import sans consentement, **y compris en `service_role`**. C'est le verrou central d'ADR-013 §5, et la fonction a été **réécrite en écart délibéré** de la doc (`0019_actuals_data_sources.sql:78-91`, elle n'appelle plus `has_active_consent()` mais réimplémente la requête). Un écart assumé et non testé sur un verrou de conformité RGPD est le pire des deux mondes.
- **T22** — `data_connection_secrets` illisible par `authenticated` (voir B2).
- **T17/T18/T19** — GRANT colonne `INSERT` sur `session_logs` (`source`, `load_units`) : la fermeture de faille d'ADR-015 §4 n'est vérifiée nulle part.
- **T34/T43/T45/T46/T47** — append-only des placements, colonnes fermées de `schedule_incidents`, contraintes d'acquittement, unicité du discriminant.

Le code des migrations m'a paru conforme à la lecture (policies, GRANT colonne et contraintes correspondent au DDL documenté, y compris l'absence volontaire de policy sur `data_connection_secrets`), mais rien n'en fige la conformité.

---

## 🟡 Importants

### I1 — Le webhook Strava effectue un traitement synchrone au-delà de l'enrôlement
`apps/web/app/api/v1/webhooks/strava/[pathSecret]/route.ts:94-106`

ADR-013 §1 est littéral : le handler « ne fait que trois choses : vérifier `subscription_id`, résoudre `owner_id`, insérer une ligne dans `job_queue` » — « aucun appel réseau, **aucune écriture métier** ». Or la branche `object_type === 'athlete'` exécute **deux écritures métier** synchrones (`delete` sur `data_connection_secrets`, `update` du statut de connexion). Le commentaire justifie l'absence d'appel réseau, ce qui est exact, mais ne couvre pas l'interdiction d'écriture métier. Une latence base inhabituelle mange le budget de 2 s et Strava abandonne après 3 tentatives, sans rejeu possible. Aligner sur la doctrine : enrôler un job `strava_deauthorize`.

### I2 — La vérification de `subscription_id` est fail-open
Même fichier, `:68-75`. Si `STRAVA_WEBHOOK_SUBSCRIPTION_ID` est absente, le contrôle est **ignoré** avec un simple `console.warn`. ADR-013 §1 la liste comme une des trois défenses complémentaires de l'endpoint. C'est l'inverse exact de la doctrine fail-closed appliquée avec rigueur ailleurs dans ce même lot (`getStravaConfig()`, `lib/stripe.ts`, `coach-llm-provider.ts`). Au minimum, refuser en production quand la variable est absente.

### I3 — Aucune limitation de débit sur le webhook
ADR-013 §1 cite explicitement la « limitation de débit » parmi les défenses de l'endpoint. Recherche globale sur `apps/web/lib` et `apps/web/app` : aucun mécanisme de rate limiting n'existe dans le projet. L'endpoint est non authentifié et déclenche une lecture base + un `INSERT` dans `job_queue` par requête.

### I4 — Comparaison du secret de chemin non constante en temps
`:20-23`, `pathSecret === config.webhookPathSecret`. Le reste du projet applique le patron inverse sur les secrets (vérification de signature Stripe). `crypto.timingSafeEqual` sur des longueurs égalisées est peu coûteux ici.

### I5 — Aucun test d'intégration côté application pour F2/F3
`apps/web/test/integration/` est inchangé. Ne sont couverts par aucun test bout-en-bout : la réconciliation déclaré/connecté sur base réelle (AC5, alors qu'ADR-015 §« à surveiller » réclame nommément « un test d'intégration dédié : une séance fusionnée ne doit apparaître dans aucun agrégat »), le job de clôture et ses 4 issues (ADR-017 §3), la route de signalement d'imprévu, l'`unmerge`, le rejeu d'enrichissement sur `PATCH` d'une ligne exclue (ADR-015, explicitement « à couvrir par un test »). Les tests purs du moteur (score hybride, placement) sont en revanche solides et bien fournis.

---

## 🟢 Nice-to-have

### N1 — `MedicalClearanceNotice` absente du Dashboard nominal
`apps/web/app/(app)/dashboard/page.tsx:80` (fetch) vs `:155-156` (rendu). Le bandeau n'est rendu que dans la branche `blocked`. `08-architecture.md` §14.4 point 1 le liste pourtant dans les bandeaux de sécurité. **Antérieur à ce lot** (déjà le cas en `948c513`) — donc hors périmètre de cette revue, mais à verser au suivi : c'est un message d'orientation médicale.

### N2 — Numérotation des migrations décalée par rapport à la doc
`docs/db-schema.md` §10/§11 désignent les migrations `0015`→`0020` ; les fichiers réels sont `0018`→`0025` (les fixes F1 ont consommé `0015`-`0017`). Correctement signalé par une note de renumérotation en tête de `0018` et de `0019`, mais `docs/db-schema.md` reste à aligner par `architect`.

### N3 — Ordre éditorial du Dashboard : conforme
Vérifié contre §14.4 : `CoachPlanCard` → `NotDoneNotice` → `WeeklyPreviewCard` (D-planning-card) → `ConnectInviteCard` → `DataCard` → `WeeklyReviewBadge`/`FreeAccessMeter`/`UpsellBanner`. L'arbitrage est honoré. Idem pour les 5 branches de `lib/jobs/drain.ts` (3 F2 + 2 F3), la formule d'ADR-014 §1 dans `compute-hybrid-score.ts`, et le filtre `excluded_at is null` + `actualLoadUnits` dans `build-planning-context.ts:75-83,200` (§13.6 point 2). Aucun `console.log` ni `TODO` résiduel.

---

## Verdict

**CORRECTIONS REQUISES**

Le socle est de bonne facture : le modèle de privilèges est appliqué avec discipline (GRANT colonne, séparation des jetons, trigger de consentement couvrant `service_role`), les invariants de frontière sont respectés dans le code livré, la doctrine fail-closed de `getStravaConfig()` reproduit fidèlement le patron `stripe.ts`, et les tests purs du moteur sont sérieux. Mais quatre défauts interdisent le merge en l'état : **la suppression de compte RGPD est cassée** (B1), **la suite de tests est rouge** (B2), **`/planning` plante sur un parcours nominal** (B3), et **le coach attribue à l'utilisateur une déduction qu'il n'a pas faite** (B4). S'y ajoute une couverture de test très en deçà de ce que la documentation spécifie (B5, B6) sur exactement les invariants et les verrous de conformité que le projet a désignés comme non négociables.

> **Prochaine étape recommandée** : re-invoquer `developer` avec ce rapport pour appliquer les corrections, puis revenir vers moi pour validation.
