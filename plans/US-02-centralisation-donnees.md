# Plan technique — US-02 — Centralisation des données (+ score hybride)

> Plan d'implémentation rédigé par `architect` le 2026-08-12. Lecture seule pour `developer` et les autres agents.
>
> Branche : `feature/US-02-centralisation-donnees`
> Référence fonctionnelle : `/09-spec-feature2-centralisation-donnees.md` (**fait foi** sur le périmètre)
> Référence design : `/09-design-feature2-notes.md` (spec écrite de substitution — rien n'a pu être écrit dans Pencil, voir §0.2)
> Référence technique : `/08-architecture.md` **§13** (contrats, flux) et `/docs/db-schema.md` **§10** (DDL canonique)
> Décisions : `/docs/adr/ADR-013` (synchronisation Strava), `ADR-014` (score hybride), `ADR-015` (réconciliation déclaré/connecté)

---

## 0. Cadrage

### 0.1 Ce que cette US n'est pas

Ce n'est pas une feature de plus posée à côté de la F1 : c'est **une couche d'enrichissement branchée sur le réalisé de la F1**. Trois conséquences pratiques, à garder en tête à chaque commit :

1. **Rien ne doit devenir obligatoire.** L'AC9 reprend l'AC12 de la F1 : le coach fonctionne intégralement sans aucune source connectée. L'invariant est vérifiable et il est **testé** (§4.3, `no-connection-dependency.test.ts`) : aucun chemin de code du coach n'interroge `data_connections`, `sync_runs` ni `hybrid_scores`.
2. **Le réalisé de la F1 était incomplet.** `session_logs` ne portait aucune charge (`load_units`), ne portait pas la discipline réellement pratiquée, et son `INSERT` était accordé table entière. Ces trois manques sont traités **avant** toute intégration tierce (lot L2), parce que le score hybride et la réconciliation en dépendent (ADR-015 §1, §4, §5).
3. **L'intégration Strava arrive en dernier.** Elle est la seule partie du périmètre qui dépende d'un tiers, d'un secret d'application et d'un texte juridique. Tout le reste — saisie manuelle étendue, réconciliation, score hybride, Dashboard centralisé — se livre et se teste sans elle.

### 0.2 État des livrables amont

| Livrable | État | Conséquence pour `developer` |
|---|---|---|
| Fiche fonctionnelle US-02 | Complète, 4 décisions produit tranchées le 2026-08-11 | Fait foi. Ne rouvrir aucune décision. |
| Notes de design | **Écrites, mais rien n'existe dans Pencil** (`09-design-feature2-notes.md` §0 : la session `designer` n'avait pas `execute`) | Les notes sont assez précises pour coder directement : toutes les valeurs sont des tokens de `docs/design-system.md`. Aucune maquette à exporter. |
| Écran « Détail par source » (AC6) | **Non conçu** — le lien « Détail → » du Dashboard n'a pas de cible maquettée | Le contrat d'API existe (`GET /data/activities`). Implémenter une vue minimale et **signaler** (`08-architecture.md` §12, question 13). |
| Point d'entrée « séance hors plan » (AC3) | **Non conçu** | Idem : affordance minimale sur `/aujourdhui`, à faire reprendre par `designer` (question 14). |
| Textes de `third_party_data_import` | **Provisoires, non validés juridiquement** | Même régime que les 4 documents F1 : `is_current = false` en migration, activé hors production par `seed.sql` (ADR-010 §9). |

### 0.3 Découpage en 5 lots

| Lot | Contenu | AC couverts | Dépend d'un tiers ? | Livrable vérifiable |
|---|---|---|---|---|
| **L1 — Schéma** | Migrations `0015` → `0018`, types générés, seeds, tests RLS / privilèges / triggers | — | non | `supabase db reset` passe, T17-T31 verts |
| **L2 — Réalisé complet** | Charge réalisée, saisie hors plan, réconciliation pure + route `unmerge` | AC3, AC5 | non | Deux séances qui se recoupent ne comptent qu'une fois |
| **L3 — Score hybride** | `computeHybridScore()` pur, route, écran `/score`, calibration | AC7, AC8, AC9 | non | Un utilisateur 100 % déclaratif obtient un score |
| **L4 — Connexion Strava** | Consentement dédié, OAuth, jetons, déconnexion, écran `/donnees` | AC1, AC2, AC10 | **oui** | Une source se connecte et se déconnecte |
| **L5 — Synchronisation & Dashboard** | Webhook, jobs, rattrapage, cron de réconciliation, carte « Mes données » | AC4, AC5, AC6 | **oui** | Une sortie Strava apparaît sans ressaisie et ne double pas une saisie |

**Point de validation humaine recommandé à la fin de L3** : c'est là que la formule du score devient visible, et c'est la dernière étape avant d'engager une intégration tierce, un secret d'application et un texte juridique.

---

## 1. Composants à créer / modifier

Server Components par défaut. `Client` uniquement pour l'interactivité réelle.

### 1.1 Packages

| Package | Emplacement | Action |
|---|---|---|
| `@hybride/domain` | `/packages/domain/src/data-sources.ts` | **Créer** — `DataSourcesView`, `DataOverviewView`, `ActivityFeedItem`, schémas Zod des routes US-02 |
| `@hybride/domain` | `/packages/domain/src/hybrid-score.ts` | **Créer** — `HybridScoreContext`, `HybridScoreResult`, `HybridScoreResponse` |
| `@hybride/domain` | `/packages/domain/src/today-plan.ts` | **Modifier** — `CreateSessionLogInputSchema` += `sportCode`, `sessionType`, `startedAt` ; `CreateSessionLogResponse` += `reconciliation` |
| `@hybride/domain` | `/packages/domain/src/ruleset.ts` | **Modifier** — section `hybridScore` **optionnelle** avec valeurs par défaut (ADR-014 §3) |
| `@hybride/rules-engine` | `/packages/rules-engine/src/hybrid-score/` | **Créer** — `compute-hybrid-score.ts` + sous-scores `volume.ts`, `consistency.ts`, `diversity.ts`. **Pur, 0 I/O** |
| `@hybride/rules-engine` | `/packages/rules-engine/src/index.ts` | **Modifier** — export de `computeHybridScore` |
| `@hybride/db` | `/packages/db/src/types.ts` | **Régénérer** après migrations |

### 1.2 Connexion de sources (AC1, AC2, AC10)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `DataSourcesPage` | `/apps/web/app/(app)/donnees/page.tsx` | Server | Créer — sous-écran, header `✕`, pas de tab bar (design §3.1) |
| `SourceCard` | `/components/data/source-card.tsx` | Server | Créer — nom + badge d'état + description + bouton ghost (design §3.3) |
| `SourceStatusBadge` | `/components/data/source-status-badge.tsx` | Server | Créer — 4 états : `NON CONNECTÉ`, `CONNECTÉ`, `SAISIE MANUELLE`, `RECONNEXION REQUISE` |
| `ConnectSourceButton` | `/components/data/connect-source-button.tsx` | **Client** | Créer — états `loading`/`error`, `aria-busy` |
| `DisconnectSheet` | `/components/data/disconnect-sheet.tsx` | **Client** | Créer — feuille AC10, CTA **violet et non rouge** (l'action n'est pas destructive), piège à focus, fermeture `Échap` |
| `OptionalBlock` | `/components/data/optional-block.tsx` | Server | Créer — « POURQUOI C'EST FACULTATIF » : porte visuellement l'AC9 |
| `ImportConsentPage` | `/apps/web/app/(app)/donnees/consentement/page.tsx` | Server | Créer — écran **bloquant avant OAuth**, patron de l'écran de consentement santé F1 |
| `ImportConsentForm` | `/components/data/import-consent-form.tsx` | **Client** | Créer — affiche le `body_md` lu en base, jamais un texte codé en dur |
| `ConnectInviteCard` | `/components/dashboard/connect-invite-card.tsx` | Server | Créer — rendue **uniquement** si `data_regime === 'cold'` (design §1.1) |
| `AccountDataSourcesRow` | `/components/account/data-sources-row.tsx` | Server | Créer — ligne permanente dans `/compte` (AC1) |

### 1.3 Dashboard centralisé (AC6)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `DataCard` | `/components/dashboard/data-card.tsx` | Server | **Créer** — la carte « Mes données » n'existe que dans la maquette, pas en code |
| `DataMetricCell` | `/components/dashboard/data-metric-cell.tsx` | Server | Créer — valeur **au-dessus** du label, glyphe de provenance en fin de ligne de label |
| `ProvenanceGlyph` | `/components/dashboard/provenance-glyph.tsx` | Server | Créer — `↻` / `✎` / `↻✎`, `aria-hidden`, le sens est porté par la légende **et** l'`aria-label` de la cellule |
| `DataLegend` | `/components/dashboard/data-legend.tsx` | Server | Créer — « ↻ Synchronisé · ✎ Déclaré », une seule fois |
| `SyncErrorNotice` | `/components/dashboard/sync-error-notice.tsx` | Server | Créer — **conserve les dernières valeurs**, ne vide jamais la carte (design §2.6) |
| `HybridScoreRow` | `/components/dashboard/hybrid-score-row.tsx` | Server | Créer — mini-anneau + valeur + chevron, dernier enfant de `DataCard` |
| `DashboardPage` | `/apps/web/app/(app)/dashboard/page.tsx` | Server | **Modifier** — insertion de `ConnectInviteCard` et `DataCard`. Conflit probable avec la F3 (§5, R9) |
| `ActivityFeedPage` | `/apps/web/app/(app)/donnees/detail/page.tsx` | Server | Créer — vue minimale du « Détail → » (écran non maquetté, §0.2) |

### 1.4 Score hybride (AC7, AC8, AC9)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `HybridScorePage` | `/apps/web/app/(app)/score/page.tsx` | Server | Créer — sous-écran `✕`, deux états |
| `ScoreRing` | `/components/score/score-ring.tsx` | Server | Créer — SVG 180 px, violet plat sans dégradé, `role="img"` + `aria-label` complet ; sous `prefers-reduced-motion`, pas d'animation de remplissage |
| `ScoreDelta` | `/components/score/score-delta.tsx` | Server | Créer — signe **et** flèche obligatoires ; baisse en `--color-warning`, **jamais** `--color-danger` |
| `VolumeBars` | `/components/score/volume-bars.tsx` | Server | Créer — 7 colonnes, piste toujours rendue, jour courant marqué deux fois (piste + initiale) |
| `DisciplineSplit` | `/components/score/discipline-split.tsx` | Server | Créer — `role="progressbar"` par ligne ; cas « une seule discipline » traité explicitement |
| `ScoreCalibrationCard` | `/components/score/score-calibration-card.tsx` | Server | Créer — **aucun chiffre**, même grisé (AC8) ; barre `role="progressbar"` `2/4` |
| `ScoreContextCard` | `/components/score/score-context-card.tsx` | Server | Créer — « CE QUE ÇA VEUT DIRE », texte du coach + « En savoir plus → » |

### 1.5 Saisie et réconciliation (AC3, AC5)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `DailyLogForm` | `/components/today/daily-log-form.tsx` | **Client** | **Modifier** — mode « séance hors plan » : discipline, type, durée, heure de début |
| `UnplannedSessionButton` | `/components/today/unplanned-session-button.tsx` | **Client** | Créer — affordance manquante (§0.2, question 14) |
| `ReconciliationNotice` | `/components/today/reconciliation-notice.tsx` | Server | Créer — « j'ai reconnu ta sortie de ce matin, j'y ai ajouté ton ressenti » + action « ce n'était pas la même séance » |

### 1.6 Bibliothèques serveur

| Module | Emplacement | Rôle |
|---|---|---|
| `finalize-session-log-load.ts` | `/apps/web/lib/data/` | **Chemin d'écriture UNIQUE** de `session_logs.load_units` (ADR-015 §1) |
| `reconcile-session-logs.ts` | `/apps/web/lib/data/` | Appariement + fusion + enrichissement — **pur et testable** (ADR-015 §2) |
| `refresh-data-regime.ts` | `/apps/web/lib/data/` | `cold` / `declared` / `connected`, côté serveur seul (`08-architecture.md` §13.5) |
| `provenance.ts` | `/apps/web/lib/data/` | `source = 'connected'` **ET** connexion active ⇒ `synced`, sinon `declared` (ADR-015 §3) |
| `compute-and-store-hybrid-score.ts` | `/apps/web/lib/score/` | Contexte → fonction pure → persistance idempotente + explication |
| `strava/oauth.ts` | `/apps/web/lib/providers/strava/` | URL d'autorisation, `state` signé (HMAC), échange de code |
| `strava/tokens.ts` | `/apps/web/lib/providers/strava/` | Chiffrement `pgcrypto`, rafraîchissement **sous bail** (`claim_connection_refresh`) |
| `strava/client.ts` | `/apps/web/lib/providers/strava/` | Appels API, lecture des entêtes de quota, back-off sur `429` |
| `strava/import-activity.ts` | `/apps/web/lib/providers/strava/` | Mapping minimisé → `session_logs` (ADR-013 §4) |
| `jobs/sync-data-connection.ts` | `/apps/web/lib/jobs/` | Orchestrateur `syncDataConnection()` + `sync_runs` |
| `jobs/drain.ts` | `/apps/web/lib/jobs/` | **Modifier** — 3 nouveaux `kind` |

---

## 2. API routes

Contrats complets et types de retour : **`08-architecture.md` §13.3**. Résumé d'implémentation :

| Route Handler | Fichier | Auth | Validation | Effets de bord |
|---|---|---|---|---|
| `GET /api/v1/data/providers` | `app/api/v1/data/providers/route.ts` | authentifié | — | Lecture `data_providers` ⋈ `data_connections` |
| `POST /api/v1/data/connections/[provider]/authorize` | `.../authorize/route.ts` | authentifié + **consentement `third_party_data_import`** | `provider ∈ data_providers(kind='oauth')` | Crée/rouvre une `data_connections` en `pending`, renvoie `authorizeUrl` + `state` signé. `403 CONSENT_REQUIRED`, `503 CONSENT_DOCUMENT_UNAVAILABLE` |
| `GET /api/v1/data/connections/[provider]/callback` | `.../callback/route.ts` | authentifié + `state` vérifié contre la session | `code`, `state`, `scope` | Échange le code, **chiffre** les jetons, `status='active'`, `external_account_id`, enrôle `strava_backfill`, redirige `/donnees` |
| `DELETE /api/v1/data/connections/[id]` | `.../connections/[id]/route.ts` | authentifié + propriétaire | — | `POST /oauth/revoke` chez Strava, **DELETE des secrets**, `status='revoked'`, `refreshDataRegime()` |
| `GET /api/v1/data/overview` | `.../data/overview/route.ts` | authentifié | — | Lecture agrégée, `no-store` |
| `GET /api/v1/data/activities` | `.../data/activities/route.ts` | authentifié | `{ from, to }` dates ISO | Lecture `session_logs` **fusions incluses**, provenance par élément |
| `GET /api/v1/score/hybrid` | `.../score/hybrid/route.ts` | authentifié | — | **Calcul paresseux** + persistance idempotente, `no-store` |
| `POST /api/v1/session-logs` | *(existant)* | authentifié + consentement santé | `CreateSessionLogInputSchema` **étendu** | += `finalizeSessionLogLoad()`, `reconcileSessionLogs()`, recalcul de score. L'ajustement AC4 reste **inchangé** |
| `POST /api/v1/session-logs/[id]/unmerge` | `.../[id]/unmerge/route.ts` | authentifié + propriétaire | — | Annule la fusion (`excluded_at = null`), recalcule le score |
| `GET /api/v1/webhooks/strava/[pathSecret]` | `.../webhooks/strava/[pathSecret]/route.ts` | — | `hub.mode`, `hub.verify_token` | Renvoie `{ "hub.challenge": … }`. **Aucun effet en base** |
| `POST /api/v1/webhooks/strava/[pathSecret]` | idem | — (**non signé**, ADR-013 §1) | `subscription_id` = le nôtre | **Enrôle un job et rend la main. < 2 s. Aucun appel réseau.** `runtime = 'nodejs'`, rate-limité |
| `GET, POST /api/v1/cron/reconcile-data-sources` | `.../cron/.../route.ts` | `CRON_SECRET` | — | Enrôle `strava_reconcile` par connexion active, `maxDuration = 60` |
| `POST /api/v1/consents/[code]/revoke` | *(existant)* | authentifié | — | **Modifier** : branche `third_party_data_import` ⇒ révocation en cascade des connexions + suppression des jetons |
| `GET /api/v1/account/export` | *(existant)* | authentifié | — | **Modifier** : inclure `data_connections` (sans jetons), `sync_runs`, `hybrid_scores` |

**Deux points sur lesquels ne pas improviser :**

- le handler de webhook **ne lit du payload que `object_id`, `aspect_type`, `owner_id`** et **refait l'appel API** dans le job. Insérer directement depuis le payload d'un webhook non signé reviendrait à laisser un tiers écrire des séances dans le compte d'un utilisateur, donc influencer son plan d'entraînement ;
- `state` est vérifié **contre l'utilisateur de la session**, pas seulement contre sa signature.

---

## 3. Schéma BDD (delta)

> **DDL canonique : [`/docs/db-schema.md`](../docs/db-schema.md) §10.** Ne pas dupliquer ici — ce fichier fait foi en cas de divergence.

### Migrations à créer, dans cet ordre

| # | Fichier | Contenu |
|---|---|---|
| 1 | `supabase/migrations/0015_data_connections.sql` | 4 enums, `data_providers`, `data_connections`, `data_connection_secrets`, `sync_runs`, `external_sport_mappings`, `claim_connection_refresh()` |
| 2 | `0016_actuals_data_sources.sql` | `alter table session_logs` (11 colonnes), contraintes, index, vue `session_logs_counted`, GRANTs `INSERT` colonne, `enforce_connected_source_consents()` + triggers |
| 3 | `0017_hybrid_scores.sql` | `hybrid_scores` + CHECK de calibration + index |
| 4 | `0018_seed_data_sources.sql` | `data_providers`, `external_sport_mappings`, `consent_documents('third_party_data_import','1.0.0')` **`is_current = false`**, ruleset `0.2.0-dev` **`is_active = false`** |
| 5 | `supabase/seed.sql` | **Modifier** — deux clauses d'activation **défensives** supplémentaires (§9.3 / §9.4 de `db-schema.md`) |

### Règles non négociables à respecter dans chaque migration

1. **`alter table X enable row level security;` immédiatement après chaque `create table`**, sans exception — y compris `data_connection_secrets` (RLS + **aucune policy** + `revoke all`).
2. **Migrations additives uniquement.** Ne pas modifier `0001` → `0014` : la F1 est mergée et des bases de preview portent des données de test (`08-architecture.md` §9, note du 2026-08-12).
3. **Aucune policy d'écriture** sur `data_connections`, `sync_runs`, `hybrid_scores` : `service_role` seul.
4. **`INSERT` révoqué puis ré-accordé colonne par colonne** sur `session_logs` et `body_metrics` (ADR-015 §4). Vérifier que `apply-daily-log.ts` (client RLS) n'écrit **aucune** colonne hors liste.
5. **Le trigger de consentement s'applique aussi au `service_role`** — c'est tout son intérêt. Les fixtures de test doivent donc créer les deux consentements avant d'insérer une ligne `connected`.
6. `supabase db reset` doit passer sans erreur avant tout commit.
7. **Ne jamais poser `is_current = true` ni `is_active = true` dans une migration** : c'est le rôle de `seed.sql`, hors production (ADR-010 §9).

### Index critiques

`session_logs (user_id, logged_date desc) where excluded_at is null` · `session_logs (data_connection_id, external_activity_id) unique where external_activity_id is not null` · `data_connections (user_id, provider_code) unique where status in ('pending','active','needs_reauth')` · `data_connections (provider_code, external_account_id) unique where … status <> 'revoked'` · `hybrid_scores (user_id, computed_for desc, created_at desc)` · `sync_runs (data_connection_id, started_at desc)`.

---

## 4. Tests à écrire

À destination de `tester`. **Un test minimum par critère d'acceptation.**

### 4.1 Tests unitaires — score hybride (`@hybride/rules-engine`)

Fixtures dans `/packages/rules-engine/__fixtures__/hybrid-score/`.

- [ ] `hybrid-score-purity.test.ts` — s'exécute avec `fetch`, `Date.now`, `Math.random` remplacés par `throw` — ADR-002/003
- [ ] `hybrid-score-determinism.test.ts` — même contexte + même ruleset ⟹ sortie strictement identique (100 itérations)
- [ ] `hybrid-score-bounds.property.test.ts` — **property-based** : pour tout contexte généré, `0 ≤ score ≤ 100` et `score === null` si et seulement si `status === 'calibration'` — **AC8**
- [ ] `hybrid-score-volume.test.ts` — courbe saturante : doubler la charge au-delà de la référence n'augmente plus `V` — **AC7**, garantit qu'on ne récompense pas la surcharge
- [ ] `hybrid-score-deload.test.ts` — une semaine de décharge **ne fait pas chuter** le score (fenêtre 28 j) — ADR-014 §2, cohérence avec l'AC8 de la F1
- [ ] `hybrid-score-diversity.test.ts` — 1 discipline ⟹ `D = 0` ; 3 disciplines équilibrées ⟹ `D = 1`
- [ ] `hybrid-score-consistency.test.ts` — mesure les jours actifs, **pas** le respect du plan : 5 séances hors plan valent 5 séances planifiées
- [ ] `hybrid-score-source-agnostic.test.ts` — deux contextes identiques, l'un `declared`, l'autre `connected` ⟹ **score strictement égal** — **AC9**
- [ ] `hybrid-score-calibration.test.ts` — `< 4 semaines` **ou** `< 4 séances` ⟹ `status = 'calibration'`, sortie nominale — **AC8**
- [ ] `hybrid-score-params.test.ts` — ruleset `0.1.0-dev` (sans section `hybridScore`) reste valide, valeurs par défaut appliquées — ADR-014 §3

### 4.2 Tests unitaires — réconciliation et charge réalisée

- [ ] `compute-load-units-realized.test.ts` — `partial` ⟹ charge proratisée ; `not_done` ⟹ `0` ; type hérité de la séance prévue — ADR-015 §1
- [ ] `reconcile-match.test.ts` — recouvrement temporel, repli sur `logged_date`, compatibilité de discipline, candidats multiples ⟹ le plus proche puis le plus ancien — **AC5**
- [ ] `reconcile-enrichment.test.ts` — RPE, fraîcheur, **douleur et `pain_at_rest`** sont transférés vers la ligne portante ; jamais écrasés — **AC5 + sécurité AC9 de la F1**
- [ ] `reconcile-both-directions.test.ts` — import puis saisie **et** saisie puis import produisent le même état final
- [ ] `provenance.test.ts` — `connected` + connexion révoquée ⟹ `declared` ; `source` **jamais** réécrit — **AC10**, ADR-015 §3
- [ ] `strava-activity-mapping.test.ts` — champs importés **exactement** ceux d'ADR-013 §4 ; un payload contenant FC/GPS/titre est ignoré, pas stocké

### 4.3 Tests d'architecture

- [ ] `no-connection-dependency.test.ts` — **le test le plus important de cette US** : aucun module du chemin coach (`lib/orchestration/**`, `packages/rules-engine/**`) n'importe ni ne référence `data_connections`, `sync_runs`, `hybrid_scores` — **AC9**
- [ ] `hybrid-score-not-in-pipeline.test.ts` — aucune étape de `generatePlan()` n'appelle `computeHybridScore()` — ADR-014 §6

### 4.4 Tests d'intégration (base réelle)

En complément de T17 → T31 de `docs/db-schema.md`, qui sont à la charge de `tester` sur le schéma :

- [ ] `insert-column-privileges.test.ts` — `authenticated` ne peut écrire ni `source`, ni `load_units`, ni `data_connection_id` — **T17-T19**
- [ ] `connected-consent-trigger.test.ts` — insertion `connected` en `service_role` refusée si l'un des deux consentements manque — **T20-T21**, ADR-013 §5
- [ ] `secrets-unreachable.test.ts` — `authenticated` ne lit rien de `data_connection_secrets` — **T22**
- [ ] `connection-uniqueness.test.ts` — une seule connexion vivante par source ; reconnexion possible après révocation — **T24**
- [ ] `import-idempotency.test.ts` — même `external_activity_id` importé 3 fois ⟹ 1 ligne — **T26**
- [ ] `refresh-lease.test.ts` — deux rafraîchissements concurrents ⟹ un seul détient le bail — **T27**, ADR-013 §3
- [ ] `aggregates-exclude-merged.test.ts` — une séance fusionnée n'apparaît **dans aucun** agrégat (score, overview, `PlanningContext`) — **T28**, **AC5**
- [ ] `hybrid-score-idempotency.test.ts` — 10 appels à `/score/hybrid` sans nouvelle donnée ⟹ 1 seule ligne `hybrid_scores`
- [ ] `disconnect-keeps-data.test.ts` — après déconnexion : 0 ligne supprimée, score **inchangé**, provenance basculée en `declared` — **AC10**
- [ ] `consent-revoke-cascades.test.ts` — retrait de `third_party_data_import` ⟹ connexions révoquées, jetons supprimés, imports refusés
- [ ] `webhook-latency.test.ts` — le handler répond `200` **sans aucun appel réseau** ; mesurer le temps de traitement — ADR-013 §1
- [ ] `webhook-forged.test.ts` — un événement portant un `object_id` inconnu ou un `subscription_id` étranger n'écrit **rien**
- [ ] `erase-account-f2.test.ts` — `erase_account()` ne laisse aucune ligne dans les 4 nouvelles tables porteuses de `user_id` — **T30**
- [ ] `cold-regime-unaffected.test.ts` — un utilisateur sans aucune connexion obtient exactement les mêmes réponses `/plan/today` et `/session-logs` qu'avant l'US-02 — **AC9**, non-régression F1

### 4.5 Tests E2E (Playwright)

- [ ] `data-sources.spec.ts` — Dashboard (régime froid) → carte d'invitation → écran Connexion données → 3 cartes, aucune connectée — **AC1**
- [ ] `data-sources-permanent-entry.spec.ts` — l'entrée de `/compte` est visible **quel que soit** le régime — **AC1**
- [ ] `strava-connect.spec.ts` — consentement → OAuth (**API Strava mockée**) → badge `CONNECTÉ` + « Dernière synchro » — **AC2**
- [ ] `strava-consent-required.spec.ts` — tenter de connecter sans consentement ⟹ redirection vers l'écran de consentement, jamais une erreur brute — **AC2**, ADR-013 §5
- [ ] `strava-sync.spec.ts` — webhook simulé ⟹ la séance apparaît sur le Dashboard avec le glyphe `↻`, sans ressaisie — **AC4**
- [ ] `duplicate-resolution.spec.ts` — saisie manuelle puis import de la même séance ⟹ **une seule** séance affichée, message de réconciliation, charge non doublée — **AC5**
- [ ] `unplanned-session.spec.ts` — enregistrer une séance de musculation hors plan ⟹ comptée dans le volume — **AC3**
- [ ] `hybrid-score-calibration.spec.ts` — moins de 4 semaines ⟹ anneau vide, tiret, **aucun chiffre**, barre `2/4` — **AC8**
- [ ] `hybrid-score.spec.ts` — 4 semaines de données ⟹ score, delta signé et fléché, volume, répartition — **AC7**
- [ ] `disconnect.spec.ts` — feuille de déconnexion → CTA violet → données conservées, glyphes passés en `✎`, score inchangé — **AC10**
- [ ] `dashboard-centralized.spec.ts` — 2 sources ⟹ résumé, glyphes mixtes, légende présente une seule fois — **AC6**
- [ ] `coach-without-sources.spec.ts` — parcours F1 complet sans jamais ouvrir l'écran Connexion données — **AC9**

**Objectif de couverture** : 70 % global sur les fichiers modifiés, **90 % minimum sur `packages/rules-engine/src/hybrid-score/`** et sur `lib/data/reconcile-session-logs.ts` (c'est là que se joue la non-duplication de l'AC5).

---

## 5. Risques identifiés

| # | Risque | Prob. | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Le score hybride n'a pas de matière première** : `session_logs` ne porte aucune charge réalisée, `actualLoadUnits` est `null` en dur | **Certaine** | **Bloquant** | Traité en L2, **avant** le score : colonne `load_units` + chemin d'écriture unique (ADR-015 §1). Ne pas commencer L3 sans L2 |
| R2 | **Double comptabilisation** d'une séance saisie **et** importée ⟹ score et charge faux, et le moteur augmente une charge déjà excessive | Élevée | **Élevé (sécurité)** | Prédicat unique `excluded_at is null` + index dédié + `aggregates-exclude-merged.test.ts` sur **tous** les agrégats |
| R3 | **Perte d'un signal de douleur** à la fusion : la ligne connectée ne porte ni RPE ni douleur | Moyenne | **Élevé (sécurité)** | Enrichissement obligatoire de la ligne portante ; test dédié `reconcile-enrichment.test.ts` ; jamais d'écrasement d'un champ de douleur |
| R4 | **Le webhook Strava n'est pas signé** : un tiers connaissant l'URL insère des séances, donc influence le plan | Moyenne | **Élevé** | Le payload n'est jamais cru : re-fetch systématique avec notre jeton (ADR-013 §1) + segment de chemin secret + contrôle de `subscription_id` |
| R5 | **Rotation du refresh token** : deux rafraîchissements concurrents cassent définitivement la connexion | Élevée | Élevé | Bail exclusif `claim_connection_refresh()` (ADR-013 §3) + `refresh-lease.test.ts` |
| R6 | **Quotas Strava globaux à l'application** (100 lectures/15 min) saturés par les rattrapages | Moyenne | Moyen | Pagination bornée, lecture des entêtes `X-RateLimit-*` dans `sync_runs`, back-off sur `429`, alerte à 80 % (à câbler avec `devops`) |
| R7 | **`INSERT` colonne restreint** casse `apply-daily-log.ts` (`permission denied for column`) | Élevée | Faible | C'est l'échec bruyant recherché (ADR-012 §3). Vérifier la liste de colonnes du `insert()` existant dès L1 |
| R8 | **Le consentement `third_party_data_import` bloque la connexion en production** tant que le texte n'est pas validé juridiquement | Certaine | Moyen | Assumé et voulu (ADR-010 §9). `503 CONSENT_DOCUMENT_UNAVAILABLE`, **jamais** un `500` ; le coach reste intégralement fonctionnel (AC9) |
| R9 | **Conflit de fusion sur `dashboard/page.tsx` et `lib/jobs/drain.ts`** avec la Feature 3 | Élevée | Faible | Points de contact documentés (`08-architecture.md` §13.8) ; rebaser tôt, arbitrer l'ordre éditorial du Dashboard avec l'architecte F3 |
| R10 | **`actualLoadUnits` devient une entrée réelle du moteur** sans que personne ne l'ait décidé | Moyenne | Moyen | Aujourd'hui aucune règle ne le lit (grep vérifié). Toute règle future qui s'en servira est un changement d'entrée moteur, à traiter comme tel (tests de non-régression sur `generatePlan`) |
| R11 | **Deux écrans manquants** (détail par source, séance hors plan) livrés « à la main » par `developer` | Certaine | Faible | Implémentation minimale conforme aux tokens + questions 13 et 14 relayées à `designer` (`08-architecture.md` §12) |
| R12 | **Transfert international vers Strava** non cadré juridiquement | Certaine | Moyen | Non bloquant pour développer, **bloquant pour l'ouverture commerciale**. Question 12 relayée au fondateur |
| R13 | **Faux positif de fusion** sur un enchaînement type triathlon (natation puis vélo à 30 min) | Moyenne | Faible | Critère de discipline + `unmerge` réversible + `match_evidence` traçant la règle appliquée |
| R14 | **Calibration du score jugée trop longue** par le fondateur (4 semaines sans chiffre) | Moyenne | Faible | Paramètre de ruleset, ajustable sans déploiement. Le rattrapage de 90 jours (L5) supprime l'attente pour tout utilisateur qui connecte Strava |

---

## 6. Ordre des étapes (pour developer)

### Lot L1 — Schéma et socle données

1. Écrire `0015_data_connections.sql` (§3) — 4 enums, 5 tables, `claim_connection_refresh()`. RLS + policies + `revoke all` sur les secrets.
2. Écrire `0016_actuals_data_sources.sql` — `alter table session_logs`/`body_metrics`, contraintes, index, vue `session_logs_counted`, GRANTs `INSERT` colonne, trigger de consentement.
3. Écrire `0017_hybrid_scores.sql` et `0018_seed_data_sources.sql`. Mettre à jour `supabase/seed.sql` (clauses **défensives**).
4. `supabase db reset` doit passer. Régénérer les types : `supabase gen types typescript --local > packages/db/src/types.ts`.
5. Corriger `apply-daily-log.ts` si le `insert()` touche une colonne hors GRANT (R7).
6. Écrire les tests d'intégration de schéma (§4.4, premiers points) — **doivent être verts avant de continuer**.
7. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
8. Commit : `feat(US-02): schéma des sources de données, charge réalisée et verrous de conformité`.

### Lot L2 — Réalisé complet (AC3, AC5)

9. `@hybride/domain` : étendre `CreateSessionLogInputSchema` (`sportCode`, `sessionType`, `startedAt`) et `CreateSessionLogResponse` (`reconciliation`).
10. `lib/data/finalize-session-log-load.ts` — chemin d'écriture **unique** de `load_units`, `service_role`.
11. `lib/data/reconcile-session-logs.ts` — appariement pur + fusion + enrichissement, avec `match_evidence`.
12. Brancher les deux dans `apply-daily-log.ts` (après l'insertion, **sans** toucher à l'ajustement AC4). Route `POST /session-logs/[id]/unmerge`.
13. `build-planning-context.ts` — peupler `actualLoadUnits`, filtrer `excluded_at is null`. **Rejouer toute la suite de tests F1** (non-régression moteur).
14. UI : mode « séance hors plan » du `DailyLogForm`, `ReconciliationNotice`.
15. Tests §4.2 + `aggregates-exclude-merged.test.ts` + E2E `unplanned-session.spec.ts`, `duplicate-resolution.spec.ts`.
16. Commit : `feat(US-02): charge réalisée, séance hors plan et résolution de doublons`.

### Lot L3 — Score hybride (AC7, AC8, AC9)

17. `@hybride/domain` : `HybridScoreContext`, `HybridScoreResult`, section `hybridScore` **optionnelle** du `RulesetParamsSchema`.
18. `packages/rules-engine/src/hybrid-score/` — les 3 sous-scores puis l'agrégation. Écrire **d'abord** `hybrid-score-bounds.property.test.ts` et `hybrid-score-source-agnostic.test.ts`.
19. `docs/rulesets/0.2.0-dev.md` — documenter les 10 paramètres, leur défaut et leur justification (pendant de `0.1.0-dev.md`).
20. `lib/score/compute-and-store-hybrid-score.ts` — contexte → fonction pure → persistance idempotente → `decision_trace` + `explanation` (le CHECK `explanations_must_be_grounded` exige ≥ 1 trace).
21. `GET /api/v1/score/hybrid` + recalcul après `POST /session-logs`.
22. Écran `/score` : les deux états, anneau, barres, répartition, carte de contexte. Accessibilité §6 des notes de design (`role="img"`, `aria-label`, `progressbar`, `prefers-reduced-motion`).
23. Tests §4.1, §4.3 + E2E `hybrid-score*.spec.ts`.
24. Commit : `feat(US-02): score hybride paramétré et phase de calibration`.
25. **⛔ STOP — point de validation humaine recommandé** : la formule et ses valeurs de référence sont désormais visibles. Faire trancher les questions ouvertes d'ADR-014 (plafond à 80 pour un mono-discipline, valeurs de référence) avant d'engager l'intégration tierce.

### Lot L4 — Connexion Strava (AC1, AC2, AC10)

26. Enregistrer l'application Strava (`devops` / fondateur) : `client_id`, `client_secret`, domaine de rappel. Variables : `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_PATH_SECRET`, `STRAVA_VERIFY_TOKEN`, `DATA_TOKEN_ENC_KEY`, `OAUTH_STATE_SECRET`.
27. Écran de consentement `third_party_data_import` (texte **lu en base**, jamais codé en dur) + route `POST /consents`.
28. `lib/providers/strava/oauth.ts` + `tokens.ts` (chiffrement, bail de rafraîchissement) + routes `authorize` / `callback` / `DELETE`.
29. Écran `/donnees` (3 cartes, badges, bouton ghost, bloc « pourquoi c'est facultatif », pied d'écran), feuille de déconnexion, carte d'invitation du Dashboard, ligne permanente de `/compte`.
30. Branche `third_party_data_import` de `POST /consents/[code]/revoke` ; extension de `GET /account/export`.
31. Tests §4.4 (secrets, unicité, bail, révocation) + E2E `data-sources*.spec.ts`, `strava-connect.spec.ts`, `disconnect.spec.ts`.
32. Commit : `feat(US-02): connexion et déconnexion d'une source Strava`.

### Lot L5 — Synchronisation et Dashboard centralisé (AC4, AC5, AC6)

33. `lib/providers/strava/client.ts` (quotas, back-off) et `import-activity.ts` (mapping **minimisé**, `external_sport_mappings`).
34. `lib/jobs/sync-data-connection.ts` — `sync_runs`, import, `finalizeSessionLogLoad()`, `reconcileSessionLogs()`, recalcul de score. 3 branches dans `drain.ts`.
35. Routes de webhook (`GET` validation, `POST` enrôlement **< 2 s**) + `GET, POST /cron/reconcile-data-sources` + entrée dans `vercel.json`.
36. Script d'exploitation de création/suppression de la souscription webhook (hors code applicatif, à documenter pour `devops`).
37. `GET /api/v1/data/overview` + carte « Mes données » du Dashboard (cellules, glyphes, légende, état d'erreur, ligne de score) + vue « Détail → » minimale.
38. `refreshDataRegime()` branché sur connexion, déconnexion, retrait de consentement et premier log.
39. Tests §4.4 restants + E2E `strava-sync.spec.ts`, `dashboard-centralized.spec.ts`, `coach-without-sources.spec.ts`.
40. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`.
41. Commit : `feat(US-02): synchronisation Strava et tableau de bord centralisé`.

---

## 7. ADR

Trois décisions structurantes ont été créées pour cette US :

- `/docs/adr/ADR-013-synchronisation-strava-webhook-et-minimisation.md` — webhook + réconciliation, jetons hors table, minimisation à l'import, **consentement dédié `third_party_data_import`** verrouillé par trigger.
- `/docs/adr/ADR-014-score-hybride-formule-parametree.md` — formule à 3 composantes sur 28 jours, paramétrée dans `rulesets.params`, calcul pur, calibration explicite.
- `/docs/adr/ADR-015-reconciliation-declare-connecte-et-provenance.md` — charge réalisée, priorité de fusion, exclusion plutôt que suppression, provenance immuable, `INSERT` restreint colonne par colonne.

Documents mis à jour : `08-architecture.md` (§2, §3, §4.1, §5, §6, §7, §8, §9, §11, §12, **§13 nouvelle**) et `docs/db-schema.md` (**§10 nouvelle**, §0.1, §0.2, §6, §9, tests T17-T31, journal R8-R13).

ADR-010 et ADR-012 **ne sont pas réécrits** : ADR-013 §5 et ADR-015 §4 les complètent explicitement, conformément à l'usage (un ADR neuf complète un ADR ancien, il ne le récrit pas).

---

## 8. Prochaine étape

→ **STOP — validation humaine obligatoire** du plan avant d'invoquer `developer`.

Trois points méritent une décision explicite du fondateur avant le premier commit :

1. **La formule du score** (ADR-014) — en particulier le plafond à 80/100 pour un athlète mono-discipline, et les valeurs de référence qui définissent « à quoi ressemble un 100 ».
2. **L'enregistrement de l'application Strava** et le budget de quota (bloquant pour les lots L4-L5, pas pour L1-L3).
3. **Le transfert international vers Strava** (`08-architecture.md` §12, question 12) — non bloquant pour développer, bloquant pour l'ouverture commerciale.

Deux retours vers `designer` sont par ailleurs à planifier en parallèle (questions 13 et 14) : l'écran « Détail par source » et l'affordance « séance hors plan », tous deux promis par les AC3 et AC6 sans maquette existante.
