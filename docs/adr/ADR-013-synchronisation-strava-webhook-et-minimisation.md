# ADR-013 — Synchronisation Strava : OAuth serveur, webhook + réconciliation, et minimisation à l'import

- **Statut** : Accepté
- **Date** : 2026-08-12
- **Décideur** : `architect`
- **Portée** : Projet — intégration tierce
- **Dépend de** : ADR-009 (patron d'intégration tierce), ADR-010 (données de santé), ADR-011 (file de jobs), ADR-012 (privilèges)
- **Feature déclenchante** : US-02, AC2 / AC4 / AC10 — et questions ouvertes §7 « fréquence de synchronisation » et « traitement RGPD des données importées »

---

## Contexte

La fiche US-02 place **l'intégration API réelle de Strava dans le périmètre V1** (tranché par le fondateur le 2026-08-11). Trois questions techniques en découlent, dont deux étaient explicitement déléguées à `architect` :

1. **Fréquence de synchronisation** (§7) : webhook temps réel ou polling périodique ?
2. **Que stocke-t-on** des activités importées ? La fiche §5 signale que « les données synchronisées restent des données personnelles, potentiellement de santé selon leur nature (fréquence cardiaque notamment) ».
3. **Consentement dédié** (§7) : le consentement `health_data_processing` de la F1 suffit-il ?

Contraintes vérifiées dans la documentation Strava (2026-08-12) :

| Fait | Conséquence architecturale |
|---|---|
| L'API Webhook Events existe et pousse `activity` (`create`/`update`/`delete`) et `athlete` (dés-autorisation) | Le temps réel est possible : pas besoin de polling comme mécanisme principal |
| **Une seule souscription webhook par application**, tous athlètes confondus | Le routage vers un utilisateur se fait par `owner_id` (identifiant athlète Strava), pas par URL de rappel dédiée |
| Le callback doit répondre **200 en moins de 2 secondes**, 3 tentatives puis abandon | Le handler ne peut rien faire de coûteux : il enrôle et rend la main |
| **Les webhooks Strava ne sont pas signés** (contrairement à Stripe, ADR-009 §2) | Le payload n'est pas une source de vérité : il ne peut servir que de déclencheur |
| Jeton d'accès valable **6 heures**, et **le refresh token est invalidé dès qu'un nouveau est émis** | Deux rafraîchissements concurrents cassent la connexion : il faut un verrou |
| Quotas par défaut : 100 lectures / 15 min, 1 000 / jour (application entière) | Le rattrapage historique doit être paginé, borné et étalé — jamais une boucle synchrone |
| Strava n'expose **ni sommeil, ni FC de repos, ni VFC** | Le sommeil et la FC de repos du Dashboard restent **déclaratifs** en V1 : la question ouverte §7 de la fiche partait d'une hypothèse inexacte |

---

## Décision

### 1. Webhook comme mécanisme principal, réconciliation quotidienne comme filet

**Webhook primaire.** `POST /api/v1/webhooks/strava/[pathSecret]` ne fait que trois choses : vérifier que `subscription_id` est bien le nôtre, résoudre `owner_id` → `data_connections`, insérer une ligne dans `job_queue`, répondre `200`. Aucun appel réseau, aucune écriture métier. Le budget de 2 secondes est ainsi tenu par construction, indépendamment de la charge du système.

**Réconciliation quotidienne.** Un cron `/api/v1/cron/reconcile-data-sources` rejoue une fenêtre glissante de 7 jours pour chaque connexion active. Motif : le webhook Strava abandonne après 3 échecs et **n'offre aucun rejeu manuel**. Sans filet, une indisponibilité de 10 minutes de notre côté produit un trou permanent et silencieux dans les données d'un utilisateur — exactement ce que l'AC4 (« sans ressaisie ») promet d'éviter. La réconciliation coûte 1 requête par connexion et par jour (`GET /athlete/activities?after=`), très en deçà des quotas.

**Rattrapage initial à la connexion.** À la première autorisation, un job `strava_backfill` importe les **90 derniers jours** d'activités, par pages de 30, en respectant les entêtes `X-RateLimit-*`. La fenêtre de 90 jours n'est pas arbitraire : elle dépasse les 4 semaines de calibration du score hybride (ADR-014), donc **un utilisateur qui connecte Strava sort immédiatement de l'état de calibration** au lieu d'attendre un mois. C'est le bénéfice produit le plus tangible de l'intégration ; le réduire à 30 jours le supprimerait.

**Le payload du webhook n'est jamais cru.** Le job ne lit du payload que `object_id` et `aspect_type`, puis **refait l'appel API** avec notre propre jeton pour obtenir l'activité. Un webhook forgé ne peut donc, au pire, que provoquer une lecture inutile sur une activité qui ne nous appartient pas — jamais l'insertion d'une donnée fabriquée par un tiers. C'est ce qui rend acceptable l'absence de signature côté Strava.

**Défense complémentaire de l'endpoint** : segment de chemin secret (`STRAVA_WEBHOOK_PATH_SECRET`, non devinable, jamais journalisé), vérification de `subscription_id`, limitation de débit. Aucune de ces mesures n'est une authentification ; elles réduisent la surface, la garantie réelle vient du re-fetch.

### 2. Les jetons vivent dans une table séparée, sans aucune policy

`data_connections` est **lisible par son propriétaire** (l'écran Connexion données a besoin des badges d'état, de `last_synced_at`, du motif d'erreur). Les jetons OAuth, eux, vivent dans `data_connection_secrets`, table distincte :

- RLS activée, **aucune policy** — patron `stripe_events` / `job_queue` : accès `service_role` exclusivement ;
- `revoke all on table … from authenticated, anon` explicite, en plus de l'absence de policy. Redondant, et voulu : les privilèges par défaut de `docs/db-schema.md` §0.1 accordent `select` à `authenticated` sur toute nouvelle table, et une policy oubliée un jour ne doit pas suffire à exposer un jeton ;
- jetons chiffrés applicativement (`pgcrypto`, clé hors base), comme `risk_flags.notes_enc` (ADR-010 §5).

**Pourquoi une table séparée plutôt qu'un GRANT colonne** : ADR-012 §3 restreint les colonnes pour `UPDATE`, verbe que RLS ne sait pas exprimer. Pour `SELECT`, la restriction colonne existe aussi en Postgres, mais elle est fragile à l'usage — `select *` échoue au lieu de masquer, les clients générés (types Supabase) exposent les colonnes, et toute nouvelle route qui fait `select("*")` casse ou fuit selon le rôle utilisé. Une table qu'aucun rôle client ne peut lire, quel que soit le `select`, est une garantie structurelle plutôt qu'une discipline de code.

### 3. Rafraîchissement de jeton sous bail exclusif

La rotation Strava (« once a new refresh token is returned, the older refresh token is invalidated immediately ») transforme deux rafraîchissements concurrents — webhook et cron sur la même connexion — en **perte définitive de la connexion**. La parade réutilise le patron déjà en place pour la file de jobs (`claim_job_queue()`, `0011_job_queue_claim.sql`) : une fonction `claim_connection_refresh(p_connection_id, p_lease_seconds)`, `security definer`, `service_role` seul, qui pose `refresh_locked_until` et indique à l'appelant s'il détient le bail. Le perdant attend et relit le jeton rafraîchi.

### 4. Minimisation : on n'importe ni la fréquence cardiaque, ni le tracé GPS

Champs importés, et eux seuls : identifiant d'activité, type de sport, date/heure de début, durée écoulée, durée en mouvement, distance, dénivelé positif.

**Exclus explicitement** : `average_heartrate` / `max_heartrate`, la `polyline` et toute coordonnée, le titre et la description de l'activité, les photos, les segments, la puissance.

Justification, appliquant l'ADR-010 §4 (minimisation) à une nouvelle source :

- la **FC d'effort** n'est lue par aucune règle du moteur en V1 (les garde-fous AC8 et le protocole douleur AC9 s'appuient sur RPE, fraîcheur et douleur, tous déclarés) et n'entre pas dans le score hybride (ADR-014, qui n'agrège que des `load_units`). Importer une donnée de l'article 9 RGPD qu'aucun chemin de code ne consomme serait de la collecte sans finalité ;
- le **tracé GPS** est une donnée de localisation précise, à fort risque de réidentification, sans usage produit en V1 (aucun écran ne montre de carte) ;
- le **texte libre** (titre, description) peut contenir n'importe quoi, y compris des données de santé non filtrables, et alimenterait un chemin LLM que l'ADR-010 §4 tient volontairement fermé.

Étendre cette liste plus tard est possible : ce sera une **nouvelle version du document de consentement** (§5), pas une simple migration.

### 5. Un consentement dédié `third_party_data_import`, verrouillé par trigger

**Réponse à la question ouverte §7 de la fiche : oui, un consentement dédié est requis.** Non pas parce que la catégorie de données changerait — les données d'entraînement sont déjà couvertes par `health_data_processing` — mais parce que le **traitement** change : nouvelle source, transfert depuis un responsable de traitement tiers, conservation d'un jeton d'accès permanent à un compte externe. Un consentement doit être *spécifique et informé* : le texte `health_data_processing` (versions `1.0.0` et `1.1.0`) ne mentionne aucun import tiers. S'en servir pour couvrir Strava, ce serait exactement le défaut corrigé en ADR-010 §10 — un texte acquitté qui ne décrit pas le comportement réel.

Mise en œuvre, strictement alignée sur le mécanisme F1 :

- nouveau `consent_documents (code = 'third_party_data_import')`, versionné, immuable, **`is_current = false`** à la migration (contenu provisoire non validé juridiquement, ADR-010 §9), activé hors production par `supabase/seed.sql` avec la même clause défensive que `0014` (ADR-010 §10, `docs/db-schema.md` §9.4) ;
- recueilli **avant** le lancement du flux OAuth, sur un écran dédié réutilisant le patron de l'écran de consentement santé F1 — jamais fondu dans le bouton « Connecter » ;
- écriture `service_role` seule, résolution de `is_current` par la route, `ip_hash`/`user_agent` calculés côté serveur (ADR-012 §1) ;
- retrait = nouvelle ligne `granted = false` (jamais un `UPDATE`), qui **révoque toutes les connexions actives** et supprime les jetons.

**Le verrou est un trigger, pas une policy.** Les imports s'exécutent en `service_role`, qui **contourne RLS** : la garantie RLS d'ADR-010 §2 ne couvre donc pas ce chemin. `enforce_connected_source_consents()`, trigger `before insert or update` sur `session_logs` et `body_metrics`, refuse toute ligne `source = 'connected'` si `health_data_processing` **ou** `third_party_data_import` n'est pas actif. Un trigger s'applique à tous les rôles, `service_role` compris : c'est le seul mécanisme qui tienne la promesse « le consentement est un verrou technique, pas une case à cocher » (ADR-010 §2) sur un chemin d'écriture serveur.

**Ce que le retrait ne fait pas** : il n'efface pas les données déjà importées. L'AC10 de la fiche a tranché la conservation ; le texte du document le dit explicitement, et indique les deux voies réelles d'effacement (retrait du consentement santé, qui purge, ou suppression du compte, ADR-010 §8). La leçon d'ADR-010 §10 est appliquée d'avance : **le texte décrit le comportement réel, y compris quand il est moins flatteur.**

**Base légale — non tranchée, explicitée.** Comme en ADR-010 §10, ce document n'invoque aucun article précis pour la conservation post-retrait : la question est relayée au conseil juridique, avec les autres textes en attente de validation (ADR-010, question ouverte n°6).

### 6. Déconnexion (AC10)

`DELETE /api/v1/data/connections/:id` : appel `POST https://www.strava.com/oauth/revoke` (endpoint recommandé depuis le 2026-06-01), **suppression de la ligne `data_connection_secrets`**, `status = 'revoked'` + `revoked_reason`, recalcul de `athlete_profiles.data_regime`. Les données importées sont conservées (AC10) ; leur affichage bascule en « déclaré » par la règle de provenance d'ADR-015 §3.

Le chemin inverse existe aussi : Strava pousse un événement `object_type = 'athlete'` avec `updates.authorized = 'false'` quand l'utilisateur retire l'autorisation **depuis Strava**. Il est traité comme une déconnexion (`revoked_reason = 'provider_deauthorized'`), sans quoi le produit afficherait « connecté » pour une connexion morte.

---

## Conséquences

**Positives**

- Le délai de l'AC4 est de l'ordre de la seconde en fonctionnement nominal, et borné à 24 h dans le pire cas (panne du webhook), sans qu'aucune donnée ne se perde.
- Aucune infrastructure nouvelle : `job_queue`, `drain-jobs` et le patron de cron d'ADR-011 absorbent la synchronisation telle quelle.
- L'analyse RGPD de l'import est courte parce que le périmètre importé est court. Chaque champ ajouté plus tard aura un coût visible (nouvelle version de consentement), ce qui est la bonne incitation.
- La panne la plus probable (jeton expiré, autorisation retirée) est un **état affiché** (`needs_reauth`, badge orange « RECONNEXION REQUISE » du design §3.3), jamais un échec silencieux.

**Négatives / à surveiller**

- **Les quotas Strava sont globaux à l'application**, pas par utilisateur : à quelques centaines d'utilisateurs connectés, le rattrapage initial devient le poste dominant. Le `sync_runs.rate_limit` enregistre les entêtes à chaque appel ; une alerte à 80 % du quota quotidien est à câbler avec `devops`. Au-delà, il faudra demander une élévation de quota à Strava ou étaler les rattrapages.
- La souscription webhook étant unique et globale, sa création/suppression est un **acte d'exploitation** (script `devops`), pas un effet de bord du code applicatif. Un environnement de preview ne peut pas avoir sa propre souscription sans une seconde application Strava.
- Le segment de chemin secret du webhook ne doit jamais apparaître dans les journaux ni dans une URL affichée. À vérifier explicitement en revue.
- Le consentement dédié ajoute un écran au parcours de connexion : c'est une friction assumée sur un parcours facultatif (AC9 : le coach fonctionne sans).

---

## Alternatives écartées

| Alternative | Raison du rejet |
|---|---|
| Polling seul (toutes les 15 min) | Coût en quota proportionnel au nombre d'utilisateurs pour un délai pire que le webhook ; le webhook existe et est gratuit. |
| Webhook seul, sans réconciliation | Strava abandonne après 3 échecs et n'offre aucun rejeu : un trou de données devient permanent et invisible. Le coût du filet est d'une requête par connexion et par jour. |
| Traiter l'activité directement dans le handler du webhook | Impossible de tenir 2 secondes avec un appel API + un rafraîchissement de jeton éventuel ; et un échec deviendrait une perte d'événement. |
| Faire confiance au payload du webhook pour insérer l'activité | Les webhooks Strava ne sont pas signés : n'importe qui connaissant l'URL insérerait des séances dans le compte d'un utilisateur, donc influencerait son plan d'entraînement. Inacceptable. |
| Stocker les jetons en colonnes de `data_connections` avec GRANT colonne | Un `select("*")` d'une future route, ou une policy trop large, expose un jeton d'accès à un compte tiers. La séparation de table rend l'erreur impossible plutôt qu'improbable. |
| Importer la FC et le GPS « puisqu'on les a » | Collecte sans finalité sur des données de l'art. 9 et de localisation précise. À rouvrir le jour où une règle du moteur les consomme réellement, avec une nouvelle version de consentement. |
| Se contenter du consentement `health_data_processing` | Ce texte ne décrit ni l'import tiers, ni la conservation d'un jeton d'accès permanent. C'est le défaut corrigé en ADR-010 §10, reproduit volontairement. |
| Vérifier le consentement d'import uniquement dans le code de la route de synchronisation | Les imports tournent en `service_role`, hors RLS : un seul oubli dans un chemin de job suffirait. Le trigger couvre tous les chemins, présents et futurs. |
| Stocker l'état OAuth (`state`) en base | Une table de plus, avec sa purge. Un `state` signé (HMAC sur `{userId, provider, nonce, exp}`) vérifié contre la session authentifiée au retour donne la même garantie CSRF sans état serveur — le code d'autorisation Strava étant lui-même à usage unique. |

---

## Questions ouvertes relayées

> 1. **Élévation de quota Strava** : à demander avant l'ouverture commerciale si le nombre d'utilisateurs connectés dépasse quelques centaines. Propriétaire : `devops`.
> 2. **Conformité aux conditions d'usage de l'API Strava** (affichage obligatoire du logo « Powered by Strava » sur les données issues de Strava, interdiction de mélanger les données Strava avec celles d'autres sources dans certaines vues). **Non traité par cette décision, non maquetté par `designer`** — à vérifier avant mise en production, car cela peut contraindre l'affichage du Dashboard centralisé (AC6). Propriétaire : fondateur + `designer`.
> 3. **Fenêtre de rattrapage initial à 90 jours** : hypothèse d'`architect`, paramétrable (`sync.initial_backfill_days`). À confirmer par le fondateur si le coût en quota devient sensible.
