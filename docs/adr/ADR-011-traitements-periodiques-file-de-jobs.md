# ADR-011 — Traitements périodiques : déclencheur planifié + file de jobs idempotente

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Mise à jour (2026-08-18, `devops`)** : tentative de bascule du déclencheur d'enrôlement vers des
  **workflows GitHub Actions planifiés** (`.github/workflows/cron-*.yml`), pour contourner la limite
  du plan **Vercel Hobby** (1 exécution/jour maximum par cron). **Abandonnée (2026-08-19, décision du
  fondateur)** : complexité d'exploitation jugée disproportionnée (deux systèmes de déclenchement à
  maintenir, secret dupliqué, observabilité éclatée entre Vercel et GitHub). Voir la mise à jour du
  2026-08-19 ci-dessous pour la décision retenue.
- **Mise à jour (2026-08-19, décision du fondateur)** : retour intégral à **Vercel Cron**
  (`apps/web/vercel.json`), plan **Hobby** conservé. Les `.github/workflows/cron-*.yml` sont
  supprimés. Deux changements accompagnent ce retour, pour absorber la contrainte « 1 exécution/jour
  par cron, précision ±59 min » (doc Vercel, vérifiée le 2026-08-19 : 100 cron jobs autorisés par
  projet, chacun au plus 1×/jour) :
  1. **Toutes les fréquences passent à 1×/jour**, réparties sur la journée pour éviter un pic
     simultané (voir tableau §7 « Budgets » mis à jour, et `apps/web/vercel.json`). `drain-jobs`
     passe de « toutes les 5 min » à quotidien — voir point 2.
  2. **Le drain devient synchrone à l'enrôlement.** Le job `drain-jobs`
     (`apps/web/lib/jobs/drain.ts`) est celui qui exécute réellement le travail mis en file par les
     autres routes cron et par le webhook Strava. À 1×/jour, ce cron introduirait à lui seul un
     délai de traitement jusqu'à ~24-26 h — inacceptable pour une synchro Strava reçue par webhook en
     temps réel, ou pour la clôture d'un imprévu du jour même. Chaque point qui enrôle un job
     (`enqueueJob()`) appelle désormais lui-même `drainJobs()` (via `drainJobsBestEffort()`) juste
     après l'enrôlement : le webhook Strava (`/webhooks/strava/[pathSecret]`) et les routes
     `/cron/enqueue-weekly-reviews`, `/cron/enqueue-schedule-closeouts`,
     `/cron/enqueue-objective-checks`, `/cron/reconcile-data-sources`. Le cron `/cron/drain-jobs`
     quotidien devient un **filet de sécurité** (jobs ratés/en échec/abandonnés, retry/back-off),
     plus le chemin principal de traitement. Le drain synchrone est **best-effort** : une exception
     du drain ne fait jamais échouer la réponse HTTP de la route qui enrôle (chaque job du lot est
     déjà protégé individuellement par `drainJobs()`, voir §3).
  3. **Fenêtre de détection élargie pour `enqueue-weekly-reviews`** (voir §1 ci-dessous, mis à jour)
     : l'ancienne fenêtre `dimanche, hour >= 18` était calibrée pour un cron horaire — avec un
     passage quotidien unique, elle ne recouvrirait le passage qu'~25 % du temps selon le fuseau de
     l'utilisateur (le cron fire à un instant UTC fixe, l'heure locale de déclenchement pour un
     fuseau donné reste quasi constante d'un jour sur l'autre). Élargie à `(isoWeekday === 7 && hour
     >= 18) || (isoWeekday === 1 && hour < 20)` (dimanche 18h → lundi 20h locale, ~26 h > la cadence
     de 24 h du cron) : garantit qu'un passage quotidien capte chaque utilisateur au moins une fois
     par semaine, quel que soit son fuseau. L'idempotence par `isoWeek` (inchangée) garantit qu'un
     utilisateur n'est jamais enrôlé deux fois même si le job passe plusieurs fois dans cette fenêtre
     élargie.
  4. **`enqueue-schedule-closeouts` n'a pas ce problème** et n'a subi aucun changement de logique :
     sa condition `hour >= closeoutLocalHour` (aucune restriction de jour) et son idempotence par
     date locale (jamais une semaine ISO) tolèrent nativement un passage 1×/jour sans perte.

  `apps/web/vercel.json` porte à nouveau une clé `crons` (six entrées, une par route, toutes
  quotidiennes). Le reste de cette décision (file `job_queue`, idempotence, verrouillage,
  dégradation gracieuse) est inchangé.
- **Décideur** : `architect`
- **Portée** : Projet
- **Dépend de** : ADR-001, ADR-005
- **Feature déclenchante** : US-01, AC5 / AC6 / AC14

---

## Contexte

Trois traitements ne sont déclenchés par aucune action utilisateur :

| Traitement | Fréquence | AC |
|---|---|---|
| Révision hebdomadaire ritualisée + notification « ta semaine est prête » | dimanche soir, **fuseau de l'utilisateur** | AC5 |
| Détection de stagnation sur 4 semaines glissantes | hebdomadaire (dans le même run) | AC6, AC7 |
| Détection de date cible atteinte / dépassée | quotidienne | AC14 |

Trois contraintes techniques :

1. **Le fuseau compte.** « Dimanche soir » n'est pas un instant unique : un utilisateur peut être hors d'Europe/Paris, et l'AC8 impose des semaines calendaires cohérentes.
2. **Durée d'exécution.** Une révision hebdomadaire = construction du `PlanningContext`, exécution du moteur, matérialisation du plan, calcul du diff, **un ou plusieurs appels LLM** pour les explications. Compter ~2 à 10 s par utilisateur. Une fonction serverless ne peut pas traiter toute la base en une invocation.
3. **Idempotence.** Le déclencheur planifié (Vercel Cron) garantit un déclenchement, pas une exécution unique : un retry après timeout ne doit pas produire deux versions de plan ni deux notifications.

Rappel de contrainte plateforme (docs Vercel, vérifié le 2026-08-04, reconfirmé le 2026-08-19) : **plan Hobby = 1 exécution par jour maximum par cron job (jusqu'à 100 cron jobs par projet), précision ±59 min**. Le plan **Pro** est requis pour une planification à la minute.

## Décision

**Cron = déclencheur d'enrôlement. File de jobs en base = exécution. Drain synchrone à l'enrôlement = chemin principal (mise à jour 2026-08-19), cron `drain-jobs` quotidien = filet de sécurité.**

```
Vercel Cron (quotidien, apps/web/vercel.json — voir mise à jour 2026-08-19 ci-dessus)
        │
        ▼
POST /api/v1/cron/enqueue-weekly-reviews        (protégé par CRON_SECRET)
        │   sélectionne les utilisateurs dont l'heure locale se trouve dans la fenêtre
        │   dimanche 18h → lundi 20h (§1), sans job pour la semaine ISO courante
        ▼
INSERT INTO job_queue (kind, user_id, idempotency_key, scheduled_for, status='pending')
        │   idempotency_key = 'weekly_review:{user_id}:2026-W32'   ← UNIQUE
        ▼
drainJobsBestEffort()  ── appelé SYNCHRONEMENT par la route d'enrôlement elle-même, juste après
        │                 l'INSERT ci-dessus (best-effort : n'échoue jamais la réponse HTTP)
        ▼
runWeeklyReview(userId)  →  engine_run → plan_version → plan_diff → explanations → notification

                                                        ▲
                                                        │ filet de sécurité (jobs ratés/en échec/
POST /api/v1/cron/drain-jobs  (Vercel Cron, quotidien) ─┘ abandonnés, retry/back-off — §3)
        │   SELECT ... FOR UPDATE SKIP LOCKED  LIMIT n
```

### 1. Fuseau par utilisateur

`profiles.timezone` (défaut `Europe/Paris`). Le cron quotidien enrôle les utilisateurs dont l'heure locale se trouve dans la fenêtre de détection cible — élargie à `(isoWeekday === 7 && hour >= 18) || (isoWeekday === 1 && hour < 20)` depuis le passage à une cadence quotidienne (voir mise à jour 2026-08-19 ci-dessus) : un passage unique par jour, à un instant UTC fixe, ne recouvrirait une fenêtre bornée à la seule journée du dimanche que pour une fraction des fuseaux. Le fuseau est aussi celui du découpage des semaines ISO du plan et de la fenêtre d'accès libre (ADR-008).

### 2. Idempotence par clé métier

`job_queue.idempotency_key UNIQUE`. La clé encode la semaine ISO : réexécuter l'enrôlement dix fois dans l'heure crée **un seul** job. Complété par le `input_snapshot_hash` de l'ADR-005 : un run identique ne produit pas de seconde `plan_version`.

### 3. Verrouillage et reprise

`FOR UPDATE SKIP LOCKED` sur des lots bornés, `attempts`, `locked_at`, `last_error`. Un job planté est repris après expiration du verrou, avec back-off exponentiel et abandon après N tentatives (alerte). Chaque job écrit un `engine_runs` — un échec est donc visible et diagnosticable, pas silencieux. **Deux appelants de `drainJobs()`** depuis la mise à jour du 2026-08-19 : le cron `/cron/drain-jobs` (quotidien, filet de sécurité) et le drain synchrone déclenché par chaque route qui enrôle (`drainJobsBestEffort()`, best-effort — une exception inattendue de `drainJobs()` lui-même, distincte de l'échec d'un job individuel déjà géré ci-dessus, est capturée et journalisée sans jamais faire échouer la réponse HTTP de la route appelante).

### 4. Dégradation gracieuse

Si l'appel LLM échoue ou dépasse son budget de temps, le job **n'échoue pas** : les explications sont produites par template (ADR-002 §3, `fallback_used = true`) et la notification part quand même. La révision hebdomadaire est un rituel produit : la manquer coûte plus cher qu'un texte moins élégant.

### 5. Notifications

Un job de révision terminé insère une ligne `notifications` puis émet sur les canaux disponibles : **Web Push** (VAPID) si un `push_subscriptions` existe, **e-mail Brevo** sinon ou en complément (voir ADR-001, limite iOS). L'état `read_at` alimente le badge persistant du Dashboard, qui garantit que l'utilisateur retrouve sa révision même si aucune notification n'est arrivée.

### 6. Les ajustements immédiats ne passent pas par la file

L'AC4 exige une baisse de charge **immédiate** après une saisie. Ce recalcul est donc **synchrone**, dans le Route Handler `POST /api/v1/session-logs` : l'utilisateur voit l'effet de sa saisie dans la réponse (« j'ai allégé ta séance de jeudi »). Le moteur à règles est pur et rapide (calcul en mémoire, pas d'appel réseau) ; seul le rendu LLM de l'explication est différé ou remplacé par le template si le budget de latence est dépassé.

### 7. Budgets

`maxDuration = 60 s` explicite sur toutes les routes qui appellent `drainJobs()` (directement ou via `drainJobsBestEffort()`) — le cron `/cron/drain-jobs`, les routes `/cron/enqueue-*`, `/cron/reconcile-data-sources` et le webhook Strava — au-delà du budget par défaut du plan Vercel Hobby (10 s). `DRAIN_BATCH_SIZE = 10` (`apps/web/lib/jobs/drain.ts`) est la taille de lot **partagée** par tous ces appelants, calibrée pour rester sous ce budget avec marge. Le nombre d'utilisateurs traités par lot est un paramètre d'exploitation, pas une constante de code dupliquée par appelant.

## Conséquences

**Positives**

- Passage à l'échelle par ajustement de la taille des lots, sans changement d'architecture.
- Aucune double-génération de plan ni double-notification, garanti par la base et non par la chance.
- Un job échoué est visible, rejouable et corrélé à un `engine_run` — cohérent avec l'exigence d'auditabilité.
- Aucune infrastructure supplémentaire à opérer : Postgres suffit comme file à cette échelle.

**Négatives / à surveiller**

- ~~**Le plan Vercel Pro est nécessaire** (le plan Hobby plafonne à un cron quotidien avec ±59 min d'imprécision, incompatible avec un rituel « dimanche soir » multi-fuseaux). À intégrer au budget par `devops`.~~ ~~**Résolu (2026-08-18)** : le fondateur choisit de rester sur le plan Hobby et de déplacer le déclenchement périodique vers des workflows GitHub Actions.~~ **Tranché définitivement (2026-08-19)** : la bascule GitHub Actions est abandonnée (complexité d'exploitation disproportionnée). Le fondateur choisit de rester sur le plan Vercel Hobby **et** sur Vercel Cron, en adaptant les fréquences à 1×/jour et en déplaçant l'exécution réelle vers un drain synchrone déclenché à l'enrôlement (voir mise à jour 2026-08-19 ci-dessus). Le cron `drain-jobs` quotidien n'est plus qu'un filet de sécurité — l'imprécision ±59 min de Vercel Cron ne pénalise donc plus le chemin de traitement principal, seulement le rattrapage des jobs en échec. Plus aucune dépendance au plan Pro ni à une seconde plateforme de déclenchement.
- **Drain synchrone à l'enrôlement (2026-08-19)** : chaque route qui enrôle exécute désormais potentiellement un lot de traitement complet dans sa propre invocation (webhook Strava compris), ce qui allonge sa latence de réponse et son `maxDuration` (60 s, aligné sur `drain-jobs`). Compromis assumé : mieux vaut une réponse HTTP plus lente qu'un délai de traitement de 24-26 h pour une synchronisation Strava ou une clôture d'imprévu. Best-effort (`drainJobsBestEffort()`) : un échec du drain ne dégrade jamais la réponse de l'enrôlement lui-même.
- Une file en base est adaptée jusqu'à quelques milliers d'utilisateurs actifs ; au-delà, migrer vers une file dédiée (QStash, Inngest, `pg_cron` + Edge Functions). Le contrat `job_queue` est conçu pour rendre cette bascule locale.
- La supervision (jobs en échec, jobs bloqués, latence LLM) doit être mise en place dès la V1 avec `devops`.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Cron unique traitant tous les utilisateurs en une invocation | Dépasse la durée maximale de fonction dès quelques dizaines d'utilisateurs ; un timeout perd tout le lot. |
| `pg_cron` + Supabase Edge Functions | Viable, mais éclate la logique métier entre Deno (Edge) et Node (Next.js), et empêche de réutiliser directement `@hybride/rules-engine` — contredit l'ADR-003. |
| Génération paresseuse à la première ouverture du dimanche | Supprime la notification, donc le rituel, qui est le cœur de l'AC5 et un levier de rétention. |
| File externe (Inngest, QStash) dès la V1 | Dépendance et coût supplémentaires non justifiés à ce volume ; Postgres + `SKIP LOCKED` couvre le besoin. |
