# ADR-011 — Traitements périodiques : déclencheur planifié + file de jobs idempotente

- **Statut** : Accepté
- **Date** : 2026-08-04
- **Mise à jour (2026-08-18, `devops`)** : le déclencheur d'enrôlement n'est plus Vercel Cron mais
  des **workflows GitHub Actions planifiés** (`.github/workflows/cron-*.yml`). Raison : le projet
  reste sur le plan **Vercel Hobby** (gratuit) — décision du fondateur — qui limite les cron jobs à
  une exécution quotidienne maximum ; le déploiement `main` avait échoué avec trois des six cron
  (horaires ou toutes les 5 min) définis dans `apps/web/vercel.json`. Chaque workflow reproduit
  l'horaire d'origine et appelle la même route `GET /api/v1/cron/<job>` avec le même en-tête
  `Authorization: Bearer ${CRON_SECRET}`. `apps/web/vercel.json` ne porte plus de clé `crons`. Le
  reste de cette décision (file `job_queue`, idempotence, verrouillage, dégradation gracieuse) est
  inchangé — seul le mécanisme de déclenchement périodique change.
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
3. **Idempotence.** Le déclencheur planifié (initialement Vercel Cron, GitHub Actions depuis la mise à jour du 2026-08-18) garantit un déclenchement, pas une exécution unique : un retry après timeout ne doit pas produire deux versions de plan ni deux notifications.

Rappel de contrainte plateforme (docs Vercel, vérifié le 2026-08-04) : **plan Hobby = 1 exécution par jour maximum, précision horaire ±59 min**. Le plan **Pro** est requis pour une planification à la minute.

## Décision

**Cron = déclencheur d'enrôlement. File de jobs en base = exécution.**

```
Déclencheur planifié (GitHub Actions, toutes les heures — voir mise à jour 2026-08-18 ci-dessus)
        │
        ▼
POST /api/v1/cron/enqueue-weekly-reviews        (protégé par CRON_SECRET)
        │   sélectionne les utilisateurs dont l'heure locale vient de passer
        │   dimanche 18:00, sans job pour la semaine ISO courante
        ▼
INSERT INTO job_queue (kind, user_id, idempotency_key, scheduled_for, status='pending')
        │   idempotency_key = 'weekly_review:{user_id}:2026-W32'   ← UNIQUE
        ▼
POST /api/v1/cron/drain-jobs                    (cron toutes les 5 min, lots bornés)
        │   SELECT ... FOR UPDATE SKIP LOCKED  LIMIT n
        ▼
runWeeklyReview(userId)  →  engine_run → plan_version → plan_diff → explanations → notification
```

### 1. Fuseau par utilisateur

`profiles.timezone` (défaut `Europe/Paris`). Le cron horaire enrôle les utilisateurs dont l'heure locale correspond au créneau cible. Le fuseau est aussi celui du découpage des semaines ISO du plan et de la fenêtre d'accès libre (ADR-008).

### 2. Idempotence par clé métier

`job_queue.idempotency_key UNIQUE`. La clé encode la semaine ISO : réexécuter l'enrôlement dix fois dans l'heure crée **un seul** job. Complété par le `input_snapshot_hash` de l'ADR-005 : un run identique ne produit pas de seconde `plan_version`.

### 3. Verrouillage et reprise

`FOR UPDATE SKIP LOCKED` sur des lots bornés, `attempts`, `locked_at`, `last_error`. Un job planté est repris après expiration du verrou, avec back-off exponentiel et abandon après N tentatives (alerte). Chaque job écrit un `engine_runs` — un échec est donc visible et diagnosticable, pas silencieux.

### 4. Dégradation gracieuse

Si l'appel LLM échoue ou dépasse son budget de temps, le job **n'échoue pas** : les explications sont produites par template (ADR-002 §3, `fallback_used = true`) et la notification part quand même. La révision hebdomadaire est un rituel produit : la manquer coûte plus cher qu'un texte moins élégant.

### 5. Notifications

Un job de révision terminé insère une ligne `notifications` puis émet sur les canaux disponibles : **Web Push** (VAPID) si un `push_subscriptions` existe, **e-mail Brevo** sinon ou en complément (voir ADR-001, limite iOS). L'état `read_at` alimente le badge persistant du Dashboard, qui garantit que l'utilisateur retrouve sa révision même si aucune notification n'est arrivée.

### 6. Les ajustements immédiats ne passent pas par la file

L'AC4 exige une baisse de charge **immédiate** après une saisie. Ce recalcul est donc **synchrone**, dans le Route Handler `POST /api/v1/session-logs` : l'utilisateur voit l'effet de sa saisie dans la réponse (« j'ai allégé ta séance de jeudi »). Le moteur à règles est pur et rapide (calcul en mémoire, pas d'appel réseau) ; seul le rendu LLM de l'explication est différé ou remplacé par le template si le budget de latence est dépassé.

### 7. Budgets

`maxDuration` explicite sur les routes de traitement (60 s), taille de lot calibrée pour rester sous ce budget avec marge. Le nombre d'utilisateurs traités par tranche de 5 min est un paramètre d'exploitation, pas une constante de code.

## Conséquences

**Positives**

- Passage à l'échelle par ajustement de la taille des lots, sans changement d'architecture.
- Aucune double-génération de plan ni double-notification, garanti par la base et non par la chance.
- Un job échoué est visible, rejouable et corrélé à un `engine_run` — cohérent avec l'exigence d'auditabilité.
- Aucune infrastructure supplémentaire à opérer : Postgres suffit comme file à cette échelle.

**Négatives / à surveiller**

- ~~**Le plan Vercel Pro est nécessaire** (le plan Hobby plafonne à un cron quotidien avec ±59 min d'imprécision, incompatible avec un rituel « dimanche soir » multi-fuseaux). À intégrer au budget par `devops`.~~ **Résolu (2026-08-18)** : le fondateur choisit de rester sur le plan Hobby et de déplacer le déclenchement périodique vers des workflows GitHub Actions (voir mise à jour ci-dessus), qui n'ont pas cette limitation de fréquence. Le reste de l'imprécision de planification (~1 min pour un cron GitHub Actions, comparable à celle d'un cron Vercel Pro) reste acceptable pour ce rituel.
- Une file en base est adaptée jusqu'à quelques milliers d'utilisateurs actifs ; au-delà, migrer vers une file dédiée (QStash, Inngest, `pg_cron` + Edge Functions). Le contrat `job_queue` est conçu pour rendre cette bascule locale.
- La supervision (jobs en échec, jobs bloqués, latence LLM) doit être mise en place dès la V1 avec `devops`.

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Cron unique traitant tous les utilisateurs en une invocation | Dépasse la durée maximale de fonction dès quelques dizaines d'utilisateurs ; un timeout perd tout le lot. |
| `pg_cron` + Supabase Edge Functions | Viable, mais éclate la logique métier entre Deno (Edge) et Node (Next.js), et empêche de réutiliser directement `@hybride/rules-engine` — contredit l'ADR-003. |
| Génération paresseuse à la première ouverture du dimanche | Supprime la notification, donc le rituel, qui est le cœur de l'AC5 et un levier de rétention. |
| File externe (Inngest, QStash) dès la V1 | Dépendance et coût supplémentaires non justifiés à ce volume ; Postgres + `SKIP LOCKED` couvre le besoin. |
