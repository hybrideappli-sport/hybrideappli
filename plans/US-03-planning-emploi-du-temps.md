# Plan technique — US-03 — Planning selon emploi du temps

> Plan d'implémentation rédigé par `architect` le 2026-08-12. Lecture seule pour `developer` et les autres agents.
>
> Branche : `feature/US-03-planning-emploi-du-temps`
> Référence fonctionnelle : `/10-spec-feature3-planning-emploi-du-temps.md` (**fait foi** sur le périmètre)
> Référence design : `/10-design-feature3-notes.md` (spec écrite de substitution — rien n'a été écrit dans Pencil, voir §0.2)
> Référence technique : `/08-architecture.md` **§14** et `/docs/db-schema.md` **§11**
> Décisions : `/docs/adr/ADR-016` (placement horaire dérivé, imprévu = indisponibilité datée, granularité), `ADR-017` (clôture d'imprévu → `session_log` `not_done`)

---

## 0. Cadrage

### 0.1 Ce que cette US n'est pas

Ce n'est pas une extension du moteur à règles. C'est **une couche de placement posée à côté de lui**, qui ne rouvre jamais une décision de contenu. Quatre conséquences à garder en tête à chaque commit :

1. **Rien de ce que la F1 a décidé ne bouge.** Type de séance, durée, charge, intensité, prescription : la F3 ne les lit que pour vérifier qu'un créneau les accueille. Le type de sortie de l'algorithme ne porte **aucun** de ces champs — c'est le compilateur qui tient l'AC3, pas la relecture (ADR-016 §5).
2. **Aucune table existante n'est modifiée.** Ni `planned_sessions` (écrite par un chemin unique, projetée depuis un snapshot immuable), ni `session_logs` (le lien de clôture vit côté F3), ni `availability_slots` (seul un trigger `after` s'y attache). Deux tables neuves, rien d'autre.
3. **Un replacement ne crée jamais de version de plan.** Donc pas de diff, pas d'invariant d'asymétrie, pas de rendu LLM. Le fondateur l'a tranché le 2026-08-11 : « événement temporel, jamais un ajustement de charge ».
4. **Le paywall n'est pas redéfini, il est appliqué.** Vue semaine = premium (AC13 de la F1, inchangé). Signalement d'imprévu = accès libre, hors quota. L'US-03 n'ajoute pas une règle de monétisation, elle en hérite d'une.

### 0.2 État des livrables amont

| Livrable | État | Conséquence pour `developer` |
|---|---|---|
| Fiche fonctionnelle US-03 | Complète, 4 décisions produit tranchées le 2026-08-11 | Fait foi. **Ne rouvrir aucune décision.** |
| Notes de design | **Écrites, mais rien n'existe dans Pencil** (`10-design-feature3-notes.md` §0 : la session `designer` n'avait ni `execute` ni `get_app_state`) | Les notes sont assez précises pour coder directement : chaque valeur est un token de `docs/design-system.md`. Aucune maquette à exporter. |
| Écran `/planning` | **Aucune maquette** (le node `RL7Pe` cité par la fiche était un frame du zoning supprimé) | Implémenter d'après `10-design-feature3-notes.md` §1, qui décrit l'écran ligne à ligne. |
| Tab bar « Planning » | **Constatée sur la maquette, inexistante en code** (`app/(app)/layout.tsx` ne rend qu'un conteneur) | **Point bloquant d'accès à l'écran.** Voir R7 et `08-architecture.md` §12, question 3. À trancher avant le lot L3. |
| État « annulée sans horaire d'origine » | Non maquetté (cas AC1 : séance jamais placée) | Rendu attendu `Mardi → Annulée`, sans heure. Signaler (question 18). |
| Valeurs de `params.planning` | Proposées par `architect`, **non validées** | 3 d'entre elles touchent à la sécurité (densité journalière) : statut `to_validate`, à confirmer avec les garde-fous AC8 avant le ruleset `1.0.0`. |

### 0.3 Découpage en 4 lots

| Lot | Contenu | AC couverts | Livrable vérifiable |
|---|---|---|---|
| **L1 — Schéma** | Migrations `0019`, `0020`, ruleset `0.3.0-dev`, types générés, tests RLS / contraintes / triggers | — | `supabase db reset` passe, T32-T42 verts |
| **L2 — Placement** | `placeWeekSessions()` pur, `materializeSessionPlacements()`, branchement sur `regeneratePlan()`, job `refresh_placements` | AC1, AC2 | Toute séance servie porte une heure, jamais sur un créneau indisponible |
| **L3 — Écrans et imprévu** | `/planning`, évolution du Dashboard et de `/aujourdhui`, `POST /schedule/incidents` | AC3 (placement), AC4, AC5, AC6 | Un clic déplace une carte, ou l'annule avec sa mention explicite |
| **L4 — Clôture** | Cron + job `schedule_closeout`, écriture du `session_log` `not_done` | AC3 (dernier `AND`) | Un imprévu non suivi d'effet devient visible de la révision hebdomadaire |

**Point de validation humaine recommandé à la fin de L2** : c'est là que le placement devient observable (heures réelles, séances déplacées, annulations) et donc que les valeurs de `params.planning` peuvent être jugées sur pièces plutôt que sur un tableau de paramètres.

---

## 1. Composants à créer / modifier

Server Components par défaut. `Client` uniquement pour l'interactivité réelle.

### 1.1 Packages

| Package | Emplacement | Action |
|---|---|---|
| `@hybride/domain` | `/packages/domain/src/planning.ts` | **Créer** — `SessionPlacementView`, `ReportIncidentInput`/`Response`, `PlacementDecision`, `PlacementInput`, schémas Zod |
| `@hybride/domain` | `/packages/domain/src/plan-week-macro.ts` | **Modifier** — `WeekPlanDayView.session` → `sessions: TodaySessionView[]` (rupture assumée, §14.5) |
| `@hybride/domain` | `/packages/domain/src/onboarding.ts` | **Modifier** — `TodaySessionView` += `placement: SessionPlacementView \| null` |
| `@hybride/domain` | `/packages/domain/src/ruleset.ts` | **Modifier** — section `planning` **optionnelle avec défauts** ; `incident_soft_limit_per_week` typé `number \| null`, **jamais requis** |
| `@hybride/rules-engine` | `/packages/rules-engine/src/placement/place-week-sessions.ts` | **Créer** — pur, 0 I/O, **hors pipeline** (+ `calendar.ts`, `candidates.ts`, `guardrail-filters.ts`) |
| `@hybride/rules-engine` | `/packages/rules-engine/src/index.ts` | **Modifier** — export de `placeWeekSessions` |
| `@hybride/db` | `/packages/db/src/types.ts` | **Régénérer** après migrations |

### 1.2 Écran Planning semaine (AC5, AC6)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `PlanningPage` | `/apps/web/app/(app)/planning/page.tsx` | Server | Créer — **premium** ; `requireEntitlement` avant toute requête ; état verrouillé réutilisant le motif `R8syr`/`LBMdV` |
| `PlanningDayGroup` | `/components/planning/day-group.tsx` | Server | Créer — `<section>` + `<h2>` par jour, `<ul>` de séances, état « Repos » sans carte (design §1.3) |
| `PlanningSessionCard` | `/components/planning/session-card.tsx` | Server | Créer — 3 états (a/b/c), liseré porteur d'état, `aria-label` complet incluant l'état |
| `PlacementBadge` | `/components/planning/placement-badge.tsx` | Server | Créer — pills outline `DÉPLACÉE` / `ANNULÉE CETTE SEMAINE`, **jamais** la couleur seule |
| `PlacementChange` | `/components/planning/placement-change.tsx` | Server | Créer — motif `mar. 18h30 → jeu. 07h00`, repris à l'identique de `MqvfH` ; **pas** de `line-through` |
| `ReportIncidentButton` | `/components/planning/report-incident-button.tsx` | **Client** | Créer — bouton **tertiaire**, 7 états (design §1.7), zone tactile ≥ 44 px, `aria-live="polite"` sur le résultat, **aucune modale ni confirmation** |
| `PlanningEmptyState` | `/components/planning/empty-state.tsx` | Server | Créer — « Aucune séance planifiée cette semaine. » |

### 1.3 Dashboard et séance du jour (AC5, AC6)

| Composant | Emplacement | Type | Action |
|---|---|---|---|
| `WeeklyPreviewCard` | `/components/dashboard/weekly-preview-card.tsx` | Server | **Modifier** — colonne heure (52 px), badges d'état, lien vers `/planning`. Reste un **aperçu glissant J → J+7**, jamais une grille Lun→Dim |
| `WeeklyPreviewLocked` | idem | Server | **Ne pas modifier** — aucune heure, aucun état d'imprévu ne fuit sous verrou (design §2.4) |
| `DashboardPage` | `/apps/web/app/(app)/dashboard/page.tsx` | Server | **Modifier** — position de `D-planning-card` fixée par `08-architecture.md` §14.4. Conflit probable avec l'US-02 (R6) |
| `CoachPlanCard` | `/components/dashboard/coach-plan-card.tsx` | Server | **Modifier** — heure de la séance + `ReportIncidentButton` (accès libre, AC6) |
| `TodayPage` | `/apps/web/app/(app)/aujourdhui/page.tsx` | Server | **Modifier** — même ajout |

### 1.4 Bibliothèques serveur

| Module | Emplacement | Rôle |
|---|---|---|
| `materialize-session-placements.ts` | `/apps/web/lib/planning/` | **Chemin d'écriture UNIQUE** de `session_placements` (ADR-016 §2). Supersède, n'écrase jamais |
| `resolve-schedule-incident.ts` | `/apps/web/lib/planning/` | Journalise l'imprévu, rejoue le placement **local**, renvoie l'état d'arrivée. Sixième orchestrateur (§3.2) |
| `build-placement-input.ts` | `/apps/web/lib/planning/` | Charge séances, disponibilités, imprévus, placements gelés → entrée de la fonction pure |
| `read-session-placements.ts` | `/apps/web/lib/planning/` | Lecture des placements courants (`superseded_at is null`) pour le jour et la semaine |
| `close-out-schedule-incidents.ts` | `/apps/web/lib/planning/` | Job de clôture, 4 issues journalisées (ADR-017 §3). **N'importe jamais `applyDailyLog` ni `regeneratePlan`** |
| `enqueue-schedule-closeouts.ts` | `/apps/web/lib/jobs/` | Enrôlement horaire par fuseau, patron de `enqueue-weekly-reviews.ts` |
| `refresh-placements.ts` | `/apps/web/lib/jobs/` | Handler du job déclenché par le trigger sur `availability_slots` (AC2) |
| `drain.ts` | `/apps/web/lib/jobs/` | **Modifier** — 2 branches. Conflit attendu avec l'US-02 (R6) |
| `regenerate-plan.ts` | `/apps/web/lib/orchestration/` | **Modifier** — appel de `materializeSessionPlacements()` dans la transaction, après `materializePlanVersion()` |
| `read-plan-week-macro.ts` / `read-today-plan.ts` | `/apps/web/lib/orchestration/` | **Modifier** — jointure sur le placement courant, `sessions[]` au pluriel |

---

## 2. API routes

| Route | Fichier | Auth / droit | Notes |
|---|---|---|---|
| `POST /api/v1/schedule/incidents` | `/app/api/v1/schedule/incidents/route.ts` | authentifié, **`requireEntitlement()` jamais appelé** | Entrée `{ plannedSessionId }` **et rien d'autre**. Vérifie la propriété, résout le placement **en synchrone**, répond `200` avec `outcome` |
| `GET /api/v1/plan/week` | existant | **premium** | Étendu : `days[].sessions[]`, `placement` par séance |
| `GET /api/v1/plan/today` | existant | libre (quota) | Étendu : `session.placement` |
| `GET, POST /api/v1/cron/enqueue-schedule-closeouts` | `/app/api/v1/cron/enqueue-schedule-closeouts/route.ts` | `CRON_SECRET` | Patron de `enqueue-weekly-reviews` (GET **et** POST, garde fail-closed) |

**Contrat de `POST /schedule/incidents` — les cinq points à ne pas rater** :

1. `outcome: 'cancelled_week'` est un **`200`**, jamais un `4xx` : une impossibilité expliquée n'est pas une panne (même doctrine que `status: 'calibration'`).
2. **Idempotent** : un second appel renvoie la même résolution, garanti par l'index unique `schedule_incidents_one_per_placement`. Le double appui ne bloque pas deux créneaux.
3. `409 SESSION_NOT_REPORTABLE` si la séance est passée, déjà annulée, ou à moins de `min_lead_time_min`.
4. `500 PLACEMENT_FAILED` **uniquement** en cas d'échec technique du calcul — le seul cas qui déclenche le message rouge du design §1.7.
5. **Ne consomme aucun accès libre** et n'est pas derrière le paywall (AC6). Ajouter la route à la liste d'ADR-008 §5.

---

## 3. Schéma BDD (delta)

DDL canonique : **`docs/db-schema.md` §11**. Ne pas recopier ici, s'y référer.

### Migrations à créer, dans cet ordre

| Fichier | Contenu |
|---|---|
| `0019_session_placements.sql` | 4 enums · `schedule_incidents` (sans la FK placement) · `session_placements` · FK manquante · index · policies · `revoke` · trigger append-only · trigger `availability_slots_refresh_placements` |
| `0020_seed_planning_ruleset.sql` | Ruleset `0.3.0-dev` (**reprend `0.2.0-dev` intégralement** + section `planning`), `is_active = false` |

Puis `supabase/seed.sql` : clause d'activation **défensive** de `0.3.0-dev` (patron §9.3, `and not exists (select 1 from rulesets x where x.is_active)`).

### Règles non négociables à respecter dans chaque migration

- **Additif uniquement.** Depuis `0011`, aucune migration existante n'est réécrite (`08-architecture.md` §9, note du 2026-08-12).
- **RLS activée + policy explicite** sur les 2 nouvelles tables, `SELECT` propriétaire seul.
- **Aucune policy d'écriture**, plus `revoke insert, delete … from authenticated` explicite : l'utilisateur signale, il ne fabrique pas un imprévu résolu ni un placement.
- **Aucun `alter table`** sur une table F1/F2. Si un besoin s'en fait sentir, c'est que le modèle a été mal compris — relire ADR-016 §1.
- `0.2.0-dev` **n'est pas modifiée** (ADR-007 §1).

---

## 4. Tests à écrire

À destination de `tester`.

### 4.1 Tests unitaires — placement (`@hybride/rules-engine`)

- [ ] `placement-respects-availability.test.ts` — aucune séance placée sur un créneau `is_available = false`, ni hors des `slot_windows` — **AC1**
- [ ] `placement-respects-capacity.test.ts` — une séance de 90 min n'entre pas dans un créneau `max_minutes = 45` ⇒ autre jour, ou annulation
- [ ] `placement-never-changes-content.property.test.ts` — property-based : sur 1 000 contextes générés, aucun champ de contenu ne diffère entre l'entrée et la sortie — **AC2, AC3**
- [ ] `placement-guardrails.property.test.ts` — aucun placement ne crée un dépassement de `max_consecutive_days_without_rest`, ni deux intenses le même jour, ni une violation d'espacement d'interférence — **AC3 (garde-fous hérités)**
- [ ] `placement-determinism.test.ts` — deux exécutions sur la même entrée produisent des décisions strictement identiques (pendant de `determinism.test.ts`)
- [ ] `placement-stays-in-iso-week.test.ts` — jamais de placement hors de la semaine ISO ⇒ **aucun report cumulatif** — **AC4**
- [ ] `placement-prefers-same-day.test.ts` — après un imprévu, un créneau libre le même jour est préféré à un autre jour — **AC3**
- [ ] `placement-cancels-explicitly.test.ts` — semaine saturée ⇒ `cancelled_week` + `reason = 'no_slot_available'`, jamais une disparition — **AC4**
- [ ] `placement-is-local.test.ts` — un imprévu ne déplace **que** la séance concernée ; les autres placements sont identiques au bit près

### 4.2 Tests d'architecture

- [ ] `placement-never-writes-plan-tables.test.ts` — aucun module de `lib/planning/**` n'importe `materializePlanVersion` ni `regeneratePlan`
- [ ] `placement-output-has-no-content.test.ts` — `PlacementDecision` ne porte aucune clé de contenu (type + runtime)
- [ ] `closeout-never-adjusts-load.test.ts` — `close-out-schedule-incidents.ts` n'importe pas `applyDailyLog` — **décision du fondateur**
- [ ] `single-writer-placements.test.ts` — `session_placements` n'est écrite que par `materialize-session-placements.ts` (pendant du contrôle d'ADR-004 §2)

### 4.3 Tests d'intégration (base réelle)

- [ ] T32-T42 de `docs/db-schema.md` (privilèges, contraintes, trigger append-only, trigger d'enrôlement, cascade d'effacement)
- [ ] Régénération de plan ⇒ les anciens placements sont **superseded**, jamais mis à jour ; exactement un placement courant par séance
- [ ] Un imprévu signalé **survit** à une régénération de plan : le créneau reste évité, le badge « DÉPLACÉE » est toujours rendu — **le test le plus important du lot**
- [ ] `UPDATE availability_slots` ⇒ exactement un job `refresh_placements` par minute, quel que soit le nombre de lignes touchées — **AC2**
- [ ] Clôture : les 4 issues d'ADR-017 §3, dont `skipped_no_consent` après retrait du consentement santé
- [ ] Clôture d'une séance replacée : elle se déclenche à la date de **destination**, pas à la date signalée
- [ ] Clôture avec un log importé le même jour (US-02) ⇒ `already_logged`, aucun doublon — **garde anti double-comptage, ADR-017 §7**
- [ ] Utilisateur `free` : `GET /plan/week` répond `402` ; `POST /schedule/incidents` répond `200` et **n'écrit aucune ligne** `free_access_events` — **AC6**

### 4.4 Tests E2E (Playwright)

- [ ] `planning-week.spec.ts` — semaine complète, une ligne par jour, heures affichées, jours de repos sans carte — **AC5**
- [ ] `report-incident-moved.spec.ts` — un clic, aucun formulaire, la carte passe en état (b) avec `mar. 18h30 → jeu. 07h00` — **AC3**
- [ ] `report-incident-cancelled.spec.ts` — semaine saturée : état (c), les deux phrases obligatoires du design §1.6 (dont « Elle n'est pas reportée à la semaine prochaine. »), bouton disparu — **AC4**
- [ ] `planning-paywall.spec.ts` — `free` : écran verrouillé, aucune heure dans le DOM ; le bouton de signalement du Dashboard reste actif — **AC6**
- [ ] `dashboard-planning-consistency.spec.ts` — même semaine, mêmes horaires, mêmes états entre `/dashboard` et `/planning` — **AC5**
- [ ] `planning-a11y.spec.ts` — `aria-live="polite"`, `aria-label` complets, focus visible, cibles ≥ 44 px, `prefers-reduced-motion`

**Objectif coverage** : 70 % minimum sur les fichiers modifiés ; 100 % des branches de `place-week-sessions.ts`.

---

## 5. Risques identifiés

| # | Risque | Prob. | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Le placement écrit dans `planned_sessions`** « pour faire simple » ⟹ divergence avec `plan_versions.snapshot` (immuable) et perte à chaque régénération | Moyenne | **Bloquant** | ADR-016 §1 + `placement-never-writes-plan-tables.test.ts` + `single-writer-placements.test.ts`. À vérifier dès la revue du L2 |
| R2 | **L'imprévu est perdu à la régénération suivante** (2 à 5 par semaine) | **Certaine si mal modélisé** | **Élevé** | L'imprévu est une indisponibilité **datée**, pas un attribut de séance (ADR-016 §3). Test d'intégration dédié, le plus important du lot |
| R3 | **Le moteur ignore `slot` et `max_minutes`** : il peut poser 90 min sur un créneau de 45 ⟹ annulations perçues comme arbitraires | Élevée | Moyen | Comportement **nominal** (AC1 renvoie au traitement explicite de l'AC4), mais à surveiller sur données réelles. Question 19 relayée à `spec-writer` |
| R4 | **Le `not_done` automatique est faux** : l'utilisateur s'est entraîné sans rien déclarer ⟹ observance dégradée à tort, diagnostic `nonadherence` biaisé | Moyenne | **Élevé (confiance)** | Fenêtre de grâce jusqu'à 03 h locale J+1 + garde « un log existe à cette date » élargi à l'utilisateur/date (ADR-017 §7). **Reste non corrigeable dans l'UI** — question 17 |
| R5 | **Rupture `days[].session` → `days[].sessions[]`** casse `weekly-preview-card.tsx` et les tests F1 | **Certaine** | Faible | Changement interne assumé, rendu nécessaire par deux séances le même jour (design §1.3). Traiter en tout début de L2 |
| R6 | **Conflit de fusion** sur `dashboard/page.tsx` et `lib/jobs/drain.ts` avec l'US-02 | Élevée | Faible | Ordre éditorial **arrêté** (`08-architecture.md` §14.4) ; rebaser tôt ; conflit mécanique, jamais sémantique |
| R7 | **L'écran `/planning` n'a aucun point d'entrée** : le design s'appuie sur une tab bar qui n'existe pas en code | **Certaine** | Moyen | Trancher avec `designer` avant L3 (question 3). Repli acceptable : lien « Voir ma semaine → » depuis `D-planning-card` |
| R8 | **Signalements en série** ⟹ semaine entièrement annulée, autant de `not_done` | Moyenne | Moyen | Aucune limite tranchée (**question produit**, non tranchée volontairement). Support prêt : journal indexé + paramètre `incident_soft_limit_per_week` à `null`. Question 16 |
| R9 | **Le placement fait fuiter du contenu premium** : une heure servie à un utilisateur `free` sur la semaine | Faible | Moyen | Le paywall reste **serveur** (§3.3) : `/plan/week` répond `402` avant toute requête. Test E2E dédié sur le DOM |
| R10 | **Valeurs de `params.planning` non validées** (densité journalière, marge de blocage) | Certaine | Faible | Paramètres de ruleset, ajustables sans déploiement. À confirmer avec les 6 garde-fous AC8 avant le `1.0.0` (ADR-016, question ouverte 1) |
| R11 | **Latence de l'AC2** : jusqu'à 5 min entre la modification des disponibilités et le recalcul | Certaine | Faible | Cadence de `drain-jobs` (ADR-011). Aucun écran de gestion des disponibilités n'existe en V1 : le trigger est une garantie d'avenir, pas un chemin chaud |
| R12 | **Une annulation « réapparaît »** après une régénération qui libère de la capacité | Faible | Faible | Conséquence assumée de la reprojection F1 (ADR-004 §1), **pas** un report cumulatif. Terminale à l'intérieur d'une même version de plan |

---

## 6. Ordre des étapes (pour developer)

### Lot L1 — Schéma

1. Écrire `0019_session_placements.sql` (`docs/db-schema.md` §11) — 4 enums, 2 tables, FK croisée, index, policies, `revoke`, 2 triggers.
2. Écrire `0020_seed_planning_ruleset.sql` — `0.3.0-dev` **reprenant `0.2.0-dev`** + section `planning`, `is_active = false`. Mettre à jour `supabase/seed.sql` (clause **défensive**).
3. `docs/rulesets/0.3.0-dev.md` — documenter les 13 paramètres, leur défaut et leur justification (pendant de `0.1.0-dev.md`).
4. `supabase db reset` doit passer. Régénérer les types : `supabase gen types typescript --local > packages/db/src/types.ts`.
5. Tests d'intégration de schéma (§4.3, T32-T42) — **verts avant de continuer**.
6. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
7. Commit : `feat(US-03): schéma de placement horaire et journal des imprévus`.

### Lot L2 — Placement (AC1, AC2)

8. `@hybride/domain` : `planning.ts`, section `planning` **optionnelle** du `RulesetParamsSchema`, `TodaySessionView.placement`, `WeekPlanDayView.sessions[]` (R5 — traiter le fan-out de types **en premier**).
9. `packages/rules-engine/src/placement/` — écrire **d'abord** `placement-respects-availability.test.ts` et `placement-guardrails.property.test.ts`, puis la fonction.
10. `lib/planning/build-placement-input.ts` + `materialize-session-placements.ts` (**chemin d'écriture unique**, supersession).
11. Brancher sur `regenerate-plan.ts`, **dans la transaction**, après `materializePlanVersion()`. Rejouer toute la suite F1 (non-régression).
12. Job `refresh_placements` + branche dans `drain.ts` ; vérifier le trigger d'enrôlement en base.
13. `read-today-plan.ts` / `read-plan-week-macro.ts` — jointure sur le placement courant.
14. Tests §4.1, §4.2 + intégration « l'imprévu survit à une régénération » (jouable dès que L3 crée des imprévus ; sinon les fabriquer en fixture).
15. Commit : `feat(US-03): placement horaire déterministe des séances planifiées`.
16. **⛔ STOP — point de validation humaine recommandé** : les horaires produits sont désormais observables. Faire juger `params.planning` sur pièces (heures obtenues, densité, annulations) avant de construire les écrans.

### Lot L3 — Écrans et signalement d'imprévu (AC3, AC4, AC5, AC6)

17. `POST /api/v1/schedule/incidents` + `lib/planning/resolve-schedule-incident.ts` (recalcul **local**, réponse synchrone, idempotence).
18. Écran `/planning` : header sans retour, 7 groupes-jour, 3 états de carte, états d'écran (`loading`/`empty`/`error`/verrouillé). Accessibilité §4 des notes de design.
19. `ReportIncidentButton` — 7 états, aucune modale, `aria-live="polite"`, **jamais de toast**.
20. Dashboard : `weekly-preview-card.tsx` (colonne heure, badges, lien), position arrêtée dans `dashboard/page.tsx` (§14.4). `WeeklyPreviewLocked` **inchangé**.
21. `/aujourdhui` et `CoachPlanCard` : heure + bouton de signalement en accès libre. Ajouter la route à la liste d'ADR-008 §5.
22. Trancher le point d'entrée de `/planning` (R7) — tab bar ou lien depuis la carte.
23. Tests §4.4 + intégration paywall.
24. Commit : `feat(US-03): écran planning semaine et signalement d'imprévu`.

### Lot L4 — Clôture d'imprévu (AC3, dernier `AND`)

25. `lib/jobs/enqueue-schedule-closeouts.ts` + route cron (GET **et** POST, garde `CRON_SECRET` fail-closed) + entrée dans `vercel.json`.
26. `lib/planning/close-out-schedule-incidents.ts` — 4 issues, date de **destination**, garde anti double-comptage, vérification du consentement santé, `load_units = 0` via `finalizeSessionLogLoad()` **si l'US-02 est fusionnée** (sinon insertion directe à 0, à réconcilier à la fusion).
27. Branche `schedule_closeout` dans `drain.ts`.
28. Tests §4.3 (clôture) + `closeout-never-adjusts-load.test.ts`.
29. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`.
30. Commit : `feat(US-03): clôture des imprévus et traçabilité de l'adhérence réelle`.

> **Dépendance à l'US-02** : les lots L1 à L3 sont **indépendants** de l'US-02. Seule l'étape 26 touche `finalizeSessionLogLoad()` (US-02). Si l'US-02 n'est pas encore fusionnée, insérer `load_units` à 0 directement et signaler le point à la fusion.

---

## 7. ADR

Deux décisions structurantes ont été créées pour cette US :

- `/docs/adr/ADR-016-placement-horaire-derive-et-journal-des-imprevus.md` — placement dérivé et matérialisé **hors** des tables du moteur, imprévu modélisé comme indisponibilité datée, granularité horaire (grille de 30 min paramétrée), algorithme pur hors pipeline, recalcul local.
- `/docs/adr/ADR-017-cloture-d-imprevu-et-ecriture-du-realise-not-done.md` — job de clôture quotidien, 4 issues journalisées, consentement santé vérifié sur un chemin `service_role`, aucun ajustement de charge.

Documents à mettre à jour : `08-architecture.md` (**§14 nouvelle**, §3.2, §4.1, §6, §6.8, §7, §11, §12, réponses en §13.8) et `docs/db-schema.md` (**§11 nouvelle**, en-tête, tests T32-T42, journal R14-R18).

> ⚠️ **Les deux mises à jour ci-dessus sont livrées sous forme de deltas prêts à coller** — `docs/us03-architecture-14-planning.md` et `docs/us03-db-schema-11-placement.md` — l'outil d'édition n'étant pas disponible dans la session `architect`. **Les coller et supprimer les deux fichiers de transfert avant le premier commit de `developer`.**

ADR-004, ADR-007, ADR-008 et ADR-011 **ne sont pas réécrits** : ADR-016 §1 et ADR-017 §1 les complètent explicitement, conformément à l'usage (un ADR neuf complète un ADR ancien, il ne le récrit pas).

---

## 8. Prochaine étape

→ **STOP — validation humaine obligatoire** du plan avant d'invoquer `developer`.

Quatre points méritent une décision explicite avant le premier commit :

1. **Le point d'entrée de l'écran `/planning`** (R7, question 3) — tab bar à créer, ou lien depuis la carte du Dashboard ? Sans arbitrage, l'écran est livré inaccessible. Propriétaire : fondateur + `designer`.
2. **La limite de fréquence du signalement d'imprévu** (question 16) — volontairement **non tranchée** par `architect`, c'est une décision produit. Par défaut : illimité. Propriétaire : fondateur.
3. **Les trois paramètres de densité journalière** (`max_sessions_per_day`, `min_minutes_between_sessions_same_day`, `allow_two_intense_sessions_same_day`) — proposés par `architect`, statut `to_validate`, à confirmer avec les garde-fous AC8. Propriétaire : fondateur.
4. **L'ordre de fusion avec l'US-02** — l'ordre éditorial du Dashboard est arrêté (§14.4), mais il faut décider laquelle des deux branches fusionne en premier pour que la seconde rebase tôt. Propriétaire : fondateur.

Deux retours vers `designer` sont à planifier en parallèle : l'état « annulée sans horaire d'origine » (question 18) et l'affichage du `not_done` automatique avec son invitation à corriger (question 17).
