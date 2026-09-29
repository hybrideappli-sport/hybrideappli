# Prêt pour la prod — liste de contrôle

> Rédigée le 2026-09-29, après trois écarts découverts en une semaine entre ce qui marche en local et ce qui marche sur `hybrideclub` / Vercel :
>
> 1. **`MISTRAL_API_KEY` absente de Vercel** : `getLlmProvider()` refuse de démarrer en production, ce qui casse l'onboarding, la régénération du plan, la revue hebdomadaire et le pipeline de chaque saisie.
> 2. **Les *Preview* écrivent dans la base de production** : un seul jeu de variables Supabase, portées « Production and Preview » (`08-architecture.md` §12, item 23).
> 3. **Aucun document de consentement courant en production** : rien ne passe `consent_documents.is_current` à `true` hors local. Personne ne peut accorder ni réaccorder son consentement santé.
>
> **La cause est commune.** `supabase/seed.sql` et `apps/web/.env.local` complètent en silence, en local, ce que la production n'a pas. Les tests, qui tournent sur la même base locale, ne peuvent pas le voir. Cette liste rend visible ce que ces deux fichiers masquent.

**Comment s'en servir.** Chaque ligne est un contrôle **vérifiable**, avec la commande ou l'écran qui le prouve. On la parcourt avant d'ouvrir le produit à des utilisateurs, puis après tout lot qui ajoute une variable, une migration d'activation ou un service externe. La colonne *État* dit ce qu'on sait à la date indiquée. « Inconnu » veut dire « à vérifier », pas « probablement bon ».

**Légende des conséquences :**
- **Bloquant** : la fonctionnalité échoue en production (erreur, écran bloqué, 500).
- **Fail closed** : l'app refuse volontairement de servir la fonctionnalité, par sécurité.
- **Dégradé** : l'app continue sans la fonctionnalité, en le journalisant.

---

## 1. Variables d'environnement — Vercel, projet `hybrideappli-web`, environnement *Production*

**Vérifier** : Vercel → `hybrideappli-web` → Settings → Environment Variables, filtre *Production*. Relevé du 2026-09-26 : **quatre variables seulement** (`NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`), aucune partagée.

Il n'existe **pas** de `.env.example` dans le dépôt, alors que `lib/map/tiles-config.ts` y renvoie. Ce tableau est aujourd'hui la seule liste complète. Il a été dressé en recensant `process.env.*` dans `apps/web` et `packages/*`.

### Socle

| Variable | Sert à | Si absente | État 2026-09-26 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client Supabase | Bloquant (`requireEnv`) | ✅ présente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase côté navigateur | Bloquant | ✅ présente |
| `SUPABASE_SERVICE_ROLE_KEY` | Client `service_role` (orchestrateurs, jobs) | Bloquant (`requireEnv`) | ✅ présente |
| `NEXT_PUBLIC_SITE_URL` | Liens des e-mails d'authentification, liens Brevo, callback OAuth Strava | Repli **silencieux** sur `http://localhost:3000` : liens cassés sans erreur | ✅ présente — vérifier que la valeur est le domaine de production |
| `MISTRAL_API_KEY` | Coach IA : onboarding, explications, débrief, pipeline de chaque saisie | **Fail closed** : `getLlmProvider()` lève, donc onboarding, régénération du plan, revue hebdo et `POST /session-logs` échouent | ❌ **absente** |
| `CRON_SECRET` | Authentifie les 6 crons de `vercel.json` | **Fail closed** : tout cron refusé. Pas de revue hebdo, de vérification d'objectif, de purge ni de clôture d'imprévus | ❌ absente |

### Paiement — Stripe

| Variable | Si absente | État |
|---|---|---|
| `STRIPE_SECRET_KEY` | Bloquant : `getStripeClient()` lève, l'abonnement est impossible | ❌ absente |
| `STRIPE_PRICE_ID_MONTHLY` | Bloquant : `getMonthlyPriceId()` lève | ❌ absente |
| `STRIPE_WEBHOOK_SECRET` | Webhook rejeté : un paiement réussi ne débloque jamais le compte | ❌ absente |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Payment Element non monté sur `/abonnement` | ❌ absente |

Vérifier aussi le **mode** : clés `sk_live_` / `pk_live_` en production, jamais `sk_test_`.

### Données connectées — Strava

`getStravaConfig()` exige les six ensemble, sinon **fail closed** sur toute fonctionnalité Strava (connexion, webhook, synchronisation).

| Variable | État |
|---|---|
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | ❌ absentes |
| `STRAVA_WEBHOOK_PATH_SECRET`, `STRAVA_VERIFY_TOKEN` | ❌ absentes |
| `DATA_TOKEN_ENC_KEY` (chiffrement des jetons OAuth au repos) | ❌ absente |
| `OAUTH_STATE_SECRET` (signature du `state` OAuth) | ❌ absente |

À part, et elle aussi **fail closed** en production : `STRAVA_WEBHOOK_SUBSCRIPTION_ID`. Sans elle, le webhook refuse toute requête, même avec les six variables présentes. ❌ absente.

Optionnelles, avec défaut : `STRAVA_WEBHOOK_RATE_LIMIT_MAX`, `STRAVA_WEBHOOK_RATE_LIMIT_WINDOW_MS`, `STRAVA_WEBHOOK_SUBSCRIBE_RATE_LIMIT_MAX`.

### Notifications

| Variable | Si absente | État |
|---|---|---|
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Dégradé : aucun e-mail. Seule la ligne `in_app` reste garantie (ADR-011) | ❌ absentes |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Dégradé : aucune notification push | ❌ absentes |

### Carte (ADR-018, en pause depuis le 2026-09-10)

| Variable | Si absente | État |
|---|---|---|
| `MAP_TILES_PLAN` | **Fail closed** en production : `/carte` refusée tant que ≠ `commercial` (`proxy.ts`) | ❌ absente — cohérent avec la pause |
| `MAP_TILES_STYLE_URL` | Bloquant sur `/carte` (`MissingMapTilesConfigurationError`) | ❌ absente |
| `NEXT_PUBLIC_MAP_TILES_API_KEY` | Tuiles non servies | ❌ absente |
| `OVERPASS_CONTACT_EMAIL` | Repli sur `contact@hybride.club` | optionnelle |
| `MAP_TRAILS_RATE_LIMIT_MAX`, `MAP_TRAILS_RATE_LIMIT_WINDOW_MS` | Défauts appliqués | optionnelles |

### À ne **jamais** définir en production

| Variable | Pourquoi |
|---|---|
| `COACH_LLM_PROVIDER=mock` | Ignorée en production par construction (`getLlmProvider()`), mais sa présence signalerait une configuration copiée depuis le local |

---

## 2. Base `hybrideclub` — ce que `seed.sql` fait en local et que rien ne fait en production

`supabase/seed.sql` n'est **jamais** rejoué sur un environnement distant (son propre en-tête le dit). Tout ce qu'il active doit avoir, en production, une migration d'activation. Sinon la fonctionnalité est morte en production et vivante partout ailleurs.

| Ce que `seed.sql` active en local | Équivalent en production | Si absent | État |
|---|---|---|---|
| Un ruleset actif (`0.1.0-dev`) | `0029_publish_ruleset_1_0_0.sql` publie et active `1.0.0` | **Bloquant** : `getActiveRuleset()` lève, plus aucun plan | Inconnu. Au 2026-09-10, la migration **n'était pas appliquée** en production |
| `consent_documents` courants : `medical_disclaimer`, `terms`, `privacy` (1.0.0), `health_data_processing` (1.1.0) | **Aucune migration** | **Bloquant** : consentement impossible, donc onboarding bloqué à l'étape consentement et aucune donnée de santé enregistrable | ❌ **manquante**, constaté le 2026-09-29 sur `/compte` |
| `consent_documents` courant : `third_party_data_import` (1.0.0) | **Aucune migration** | Bloquant pour la connexion Strava (ADR-013 §5) | ❌ manquante |

**La migration de consentement attend une décision** : publier les textes provisoires tels quels, qui portent la mention « Contenu provisoire — à faire valider juridiquement », ou publier une nouvelle version juridiquement validée (`08-architecture.md` §12, item 10).

**Vérifier** (éditeur SQL Supabase, projet `hybrideclub`) :

```sql
-- Migrations appliquées : la dernière doit être la plus récente de supabase/migrations/.
select version, name from supabase_migrations.schema_migrations order by version desc limit 5;

-- Exactement UN ruleset actif, et ce doit être 1.0.0.
select version, is_active, published_at from rulesets order by published_at nulls first;

-- Un document COURANT par (code, locale), pour les cinq codes.
select code, version, locale, is_current from consent_documents order by code, version;

-- Référentiel des sports peuplé (0010).
select count(*) from sports;
```

Depuis le poste de dev, lié au projet : `npx supabase migration list --linked` compare les migrations locales à celles de la base distante.

**Règle pour la suite** : toute nouvelle ligne `update … set is_active/is_current = true` dans `seed.sql` doit arriver avec sa migration de production **ou** avec une ligne dans ce tableau qui dit pourquoi elle n'en a pas encore.

---

## 3. Services externes — configurés côté fournisseur, pas dans le code

| Contrôle | Comment vérifier | État |
|---|---|---|
| **Mistral** : plan payant, clé API active | Console Mistral. Un plan Free renvoie `429` à chaque appel | ❌ plan Free (2026-09-26) |
| **Stripe** : endpoint de webhook pointant vers `https://<domaine>/api/v1/webhooks/stripe`, en mode *live* | Dashboard Stripe → Developers → Webhooks | Inconnu |
| **Strava** : *Authorization Callback Domain* = domaine de production ; souscription webhook créée vers `/api/v1/webhooks/strava/<STRAVA_WEBHOOK_PATH_SECRET>` | strava.com/settings/api ; `STRAVA_WEBHOOK_SUBSCRIPTION_ID` renseigné | Inconnu |
| **Brevo** : domaine expéditeur authentifié (SPF / DKIM) pour `BREVO_SENDER_EMAIL` | Brevo → Senders & Domains | Inconnu |
| **Supabase Auth** : *Site URL* et *Redirect URLs* = domaine de production | Supabase → Authentication → URL Configuration | Inconnu |
| **Stadia** : plan commercial, seulement à la reprise de la carte | — | Hors sujet tant que la carte est en pause |

---

## 4. Crons (`apps/web/vercel.json`)

Six crons quotidiens, compatibles avec le plan Hobby (une exécution par jour et par cron, arbitrage du 2026-08-19) :

| Cron | Heure (UTC) |
|---|---|
| `enqueue-weekly-reviews` | 20:00 |
| `enqueue-objective-checks` | 06:00 |
| `enqueue-schedule-closeouts` | 05:00 |
| `drain-jobs` | 04:00 |
| `purge-stripe-events` | 03:30 |
| `reconcile-data-sources` | 03:15 |

**Vérifier** : Vercel → *Cron Jobs* liste les six. Après une nuit, *Logs* montre des réponses `200`, et non `401`. Un `401` signale `CRON_SECRET` absente.

`drain-jobs` ne passe qu'**une fois par jour** : un job enfilé à 20:00 (revue hebdo) ne s'exécute qu'à 04:00 le lendemain. C'est connu et assumé, pas une panne.

---

## 5. Isolation des environnements

| Contrôle | État |
|---|---|
| Une *Preview* n'écrit jamais dans `hybrideclub` : variables Supabase propres à *Preview*, pointant vers un autre projet ou une *branch database* | ❌ dette ouverte, `08-architecture.md` §12 item 23 |
| Aucune migration d'une branche non fusionnée n'est appliquée sur `hybrideclub` | Règle en vigueur pour US-05 (amendement ADR-019 du 2026-09-26) |

---

## 6. Contenu et conformité

| Contrôle | Référence | État |
|---|---|---|
| Textes des `consent_documents` validés juridiquement | `08-architecture.md` §12, item 10 | ❌ provisoires |
| Strava, sous-traitant hors UE, mentionné dans la politique de confidentialité | §12, item 12 | Inconnu |
| Plan Stadia commercial avant toute réouverture de `/carte` | ADR-018 §8 | Sans objet (pause) |

---

## 7. Vérification après chaque déploiement de production

Un parcours minimal, sur un **compte de test dédié** en production, dans cet ordre. Chaque étape dépend des précédentes, et le premier échec localise la panne :

1. **Inscription** et réception de l'e-mail : `NEXT_PUBLIC_SITE_URL`, Supabase Auth.
2. **Onboarding** jusqu'au récapitulatif : `MISTRAL_API_KEY`.
3. **Avertissement médical et consentement santé** : `consent_documents` courants.
4. **Plan généré** : ruleset actif.
5. **Saisie d'une séance** sur `/aujourdhui`, retour « Saisie enregistrée » : pipeline de signaux, fournisseur LLM.
6. **Correction de cette saisie** : `PATCH /session-logs/:id`, une seule baisse de charge.
7. **`/compte`** : réaccorder le consentement, `consent_documents`.
8. **`/abonnement`** : le Payment Element se monte (Stripe), sans aller jusqu'au paiement.

Puis Vercel → *Logs*, filtrer sur `error` : aucune ligne `[coach-llm]`, `[cron]`, `[strava]` ni `getActiveRuleset`.

---

## 8. Pour ne pas redécouvrir ces écarts un par un

Pistes, **non implémentées** :

- **Un `.env.example` à jour**, versionné : la liste de la §1, sans valeurs. Il est déjà référencé par `lib/map/tiles-config.ts` et n'existe pas.
- **Une route de santé** (`/api/v1/health/readiness`, protégée par `CRON_SECRET`) qui vérifie en un appel la présence des variables de la §1 et l'état de la base de la §2 : ruleset actif, documents courants. Elle renverrait la liste de ce qui manque au lieu d'un premier `500` en production.
- **Un test d'architecture** qui échoue si `seed.sql` active une ligne sans migration de production correspondante ni mention dans la §2.
