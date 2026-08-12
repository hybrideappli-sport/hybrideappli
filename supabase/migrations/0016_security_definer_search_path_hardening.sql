-- Durcissement `search_path` de toutes les fonctions `security definer` du repo — vecteur
-- pg_temp, distinct du vecteur CREATE-sur-public déjà fermé (0001_extensions_enums_helpers.sql).
--
-- `search_path = public` (sans lister `pg_temp`) laisse Postgres chercher `pg_temp` IMPLICITEMENT
-- EN PREMIER pour les relations et les types (pas pour les fonctions ni les opérateurs) — avant
-- même `pg_catalog`. `TEMPORARY` sur la base est accordé à `PUBLIC` par défaut et n'est révoqué
-- nulle part dans ce repo. Un appelant disposant d'`EXECUTE` peut donc créer une table temporaire
-- portant le même nom qu'une relation référencée SANS qualification de schéma dans le corps de la
-- fonction, et cette table est lue à la place de celle voulue — avec les privilèges du
-- propriétaire de la fonction (`security definer`).
--
-- Audit des 7 fonctions `security definer` du repo (référence non qualifiée trouvée / EXECUTE
-- accordé au-delà de `service_role`) :
--
--   has_active_consent(uuid,text)   `consents` non qualifiée    — EXECUTE : authenticated  → EXPLOITABLE
--   is_staff()                      `profiles` non qualifiée    — EXECUTE : authenticated  → EXPLOITABLE
--   handle_new_user()               `public.profiles` qualifiée — trigger, pas de RPC direct
--   erase_account(uuid)             `consents` non qualifiée    — EXECUTE : service_role seul
--   requeue_stuck_job_queue(int)    `job_queue` non qualifiée   — EXECUTE : service_role seul
--   claim_job_queue(int)            `job_queue` non qualifiée   — EXECUTE : service_role seul
--   purge_stale_stripe_events(int)  `stripe_events` non qualifiée — EXECUTE : service_role seul
--
-- `has_active_consent` et `is_staff` sont les deux vecteurs réels : un utilisateur `authenticated`
-- pourrait forger sa propre ligne de consentement (contournant le gate de consentement santé sur
-- `athlete_profiles`) ou s'auto-attribuer `is_staff() = true`. Les 5 autres ne sont accessibles
-- qu'à `service_role`, un rôle de confiance — la correction est néanmoins appliquée aux 7 par
-- cohérence et défense en profondeur, sans coût.
--
-- Correctif : `pg_temp` explicitement EN DERNIER dans `search_path`, au lieu d'implicitement en
-- premier. Aucune réécriture de corps de fonction — une référence non qualifiée à `consents`
-- résout désormais via l'entrée `public` de la liste avant d'atteindre `pg_temp`. Formulation
-- recommandée par la documentation PostgreSQL pour les fonctions `SECURITY DEFINER`.

alter function public.has_active_consent(uuid, text) set search_path = pg_catalog, public, pg_temp;
alter function public.is_staff() set search_path = pg_catalog, public, pg_temp;
alter function public.handle_new_user() set search_path = pg_catalog, public, pg_temp;
alter function public.erase_account(uuid) set search_path = pg_catalog, public, pg_temp;
alter function public.requeue_stuck_job_queue(int) set search_path = pg_catalog, public, pg_temp;
alter function public.claim_job_queue(int) set search_path = pg_catalog, public, pg_temp;
alter function public.purge_stale_stripe_events(int) set search_path = pg_catalog, public, pg_temp;
