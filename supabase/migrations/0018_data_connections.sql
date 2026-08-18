-- supabase/migrations/0018_data_connections.sql — US-02, Lot L1, ADR-013
-- Source : docs/db-schema.md §10.1-§10.4 (DDL canonique).
--
-- Renumérotée par `developer` : le plan `plans/US-02-centralisation-donnees.md` et
-- `docs/db-schema.md` désignent cette migration `0015_data_connections.sql`, en supposant que la
-- F1 s'arrêtait à `0014`. Trois correctifs post-F1 (`0015_club_app_enrolled.sql`,
-- `0016_security_definer_search_path_hardening.sql`, `0017_app_enrolled_from_signup_metadata.sql`)
-- occupent en réalité ces numéros sur ce dépôt. Migrations additives uniquement (§3 du plan,
-- règle 2) : on ne renomme ni ne modifie `0001`→`0017`, on poursuit la numérotation à `0018`.
-- Signalé dans le rapport de fin de lot pour mise à jour de la documentation par `architect`.
--
-- Delta additif : quatre enums, cinq tables/fonctions liées aux sources de données externes.
-- Aucune réécriture des migrations F1.

-- 10.1 — Enums ---------------------------------------------------------------

create type data_connection_status as enum ('pending','active','needs_reauth','revoked');
create type sync_trigger           as enum ('initial_backfill','webhook','scheduled_reconcile','manual');
create type sync_status            as enum ('running','succeeded','partial','failed');
create type hybrid_score_status    as enum ('calibration','available');

-- 10.2 — Référentiel des sources (`data_providers`) --------------------------
-- Alimente l'écran Connexion données (une carte par source, design §3.3/§3.4) sans coder les
-- sources dans le client : ajouter « Garmin » un jour sera une ligne, pas un déploiement.

create table data_providers (
  code           text primary key,          -- 'strava' | 'strength_manual' | 'nutrition_manual'
  label_fr       text not null,
  kind           text not null check (kind in ('oauth','manual')),
  description_fr text not null,             -- ligne 2 de la carte (design §3.4)
  is_available   boolean not null default true,
  display_order  smallint not null default 100,
  created_at     timestamptz not null default now()
);
alter table data_providers enable row level security;
create policy "data_providers_read" on data_providers for select to authenticated using (true);
-- Référentiel : écriture `service_role`, aucun GRANT UPDATE.

-- 10.3 — Connexions (`data_connections`) et jetons (`data_connection_secrets`) -

-- État de connexion par (utilisateur, source). LISIBLE par son propriétaire : l'écran a besoin
-- du badge d'état, de la dernière synchro et du motif d'erreur. AUCUNE policy d'écriture :
-- une connexion se crée et se révoque exclusivement par une route serveur (ADR-013 §2).
create table data_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  provider_code         text not null references data_providers(code),
  status                data_connection_status not null default 'pending',
  external_account_id   text,                       -- Strava athlete id = `owner_id` des webhooks
  scopes                text[] not null default '{}',
  connected_at          timestamptz,
  last_synced_at        timestamptz,
  last_sync_status      sync_status,
  last_error_code       text,                       -- 'token_invalid'|'rate_limited'|'provider_error'
  backfill_completed_at timestamptz,
  revoked_at            timestamptz,
  revoked_reason        text check (revoked_reason in
                          ('user','provider_deauthorized','consent_withdrawn','token_invalid')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table data_connections enable row level security;
create policy "data_connections_select_own" on data_connections for select to authenticated
  using (user_id = (select auth.uid()));
-- Ni INSERT, ni UPDATE, ni DELETE pour `authenticated` : l'utilisateur ne se déclare pas connecté.
revoke insert, delete on data_connections from authenticated;
create trigger data_connections_touch before update on data_connections
  for each row execute function touch_updated_at();

-- Une seule connexion vivante par (utilisateur, source) ; les connexions révoquées s'empilent
-- comme historique et gardent le lien vers les séances qu'elles ont importées (ADR-015 §3).
create unique index data_connections_one_live_per_provider
  on data_connections (user_id, provider_code)
  where status in ('pending','active','needs_reauth');

-- Un compte tiers ne peut alimenter qu'un seul compte Hybride Club : sans cela, le routage
-- d'un webhook par `owner_id` serait ambigu.
create unique index data_connections_external_account
  on data_connections (provider_code, external_account_id)
  where external_account_id is not null and status <> 'revoked';

create index data_connections_active on data_connections (status, last_synced_at)
  where status = 'active';

-- Jetons OAuth. Table SÉPARÉE, sans aucune policy : `service_role` exclusivement (ADR-013 §2).
-- Le `revoke` explicite double l'absence de policy — les privilèges par défaut (§0.1) accordent
-- `select` à `authenticated` sur toute nouvelle table, et une policy ajoutée par erreur un jour
-- ne doit pas suffire à exposer un jeton d'accès à un compte tiers.
create table data_connection_secrets (
  data_connection_id       uuid primary key references data_connections(id) on delete cascade,
  access_token_enc         bytea not null,          -- pgcrypto, clé hors base (ADR-010 §5)
  refresh_token_enc        bytea not null,
  access_token_expires_at  timestamptz not null,
  refresh_locked_until     timestamptz,             -- bail exclusif de rafraîchissement
  rotated_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);
alter table data_connection_secrets enable row level security;
revoke all on table data_connection_secrets from authenticated, anon;
-- AUCUNE policy. Patron `stripe_events` / `job_queue`.

-- Rotation Strava : un nouveau refresh_token invalide immédiatement l'ancien. Deux
-- rafraîchissements concurrents (webhook + cron) casseraient la connexion. Bail exclusif,
-- même patron que `claim_job_queue()` (0011). ADR-013 §3.
--
-- `search_path = pg_catalog, public, pg_temp` dès la création (cf. `0016_security_definer_
-- search_path_hardening.sql` pour la justification complète : `pg_temp` implicitement en premier
-- sinon, vecteur d'attaque sur toute fonction `security definer`) — écrite correctement d'emblée
-- plutôt que durcie a posteriori.
create or replace function public.claim_connection_refresh(p_connection_id uuid, p_lease_seconds int)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with claimed as (
    update data_connection_secrets
       set refresh_locked_until = now() + make_interval(secs => p_lease_seconds)
     where data_connection_id = p_connection_id
       and (refresh_locked_until is null or refresh_locked_until < now())
    returning data_connection_id
  )
  select exists (select 1 from claimed);
$$;
revoke all on function public.claim_connection_refresh(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_connection_refresh(uuid, int) to service_role;

-- 10.4 — Traçabilité des synchronisations (`sync_runs`) ----------------------
-- Pendant de `engine_runs` pour l'import : une ligne par exécution, réussie ou non. C'est ce qui
-- rend l'état « SYNCHRONISATION EN ÉCHEC » du design (§2.6) diagnosticable au lieu d'être un
-- message générique.

create table sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  data_connection_id uuid not null references data_connections(id) on delete cascade,
  trigger            sync_trigger not null,
  window_start       timestamptz,
  window_end         timestamptz,
  status             sync_status not null default 'running',
  items_seen         int not null default 0,
  items_imported     int not null default 0,
  items_merged       int not null default 0,     -- AC5 — doublons résolus
  items_skipped      int not null default 0,
  items_failed       int not null default 0,
  external_cursor    text,                       -- epoch `after=` de la dernière page traitée
  rate_limit         jsonb,                      -- entêtes X-RateLimit-* du dernier appel (ADR-013)
  error_code         text,
  error_message      text,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz
);
alter table sync_runs enable row level security;
create policy "sync_runs_select_own"   on sync_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "sync_runs_select_staff" on sync_runs for select to authenticated using (is_staff());
-- Aucune policy d'écriture : produit par le serveur, comme `engine_runs`.
create index sync_runs_recent     on sync_runs (user_id, started_at desc);
create index sync_runs_connection on sync_runs (data_connection_id, started_at desc);

-- 10.5 — Cartographie des disciplines externes (`external_sport_mappings`) ---
-- Traduit un `sport_type` Strava vers le référentiel `sports` de la F1, et fournit le type de
-- séance par défaut nécessaire au calcul de `load_units` quand le log n'est rattaché à aucune
-- séance prévue (ADR-015 §1). `sport_id` nul ⇒ discipline non cartographiée : la séance est
-- importée sans discipline plutôt que rejetée (AC3 — jamais de blocage).

create table external_sport_mappings (
  provider_code        text not null references data_providers(code),
  external_code        text not null,          -- 'Run','TrailRun','Ride','Swim','WeightTraining',…
  sport_id             uuid references sports(id),
  default_session_type session_type not null default 'endurance',
  primary key (provider_code, external_code)
);
alter table external_sport_mappings enable row level security;
create policy "external_sport_mappings_read" on external_sport_mappings for select to authenticated using (true);
-- Référentiel : écriture `service_role`, aucun GRANT UPDATE.
