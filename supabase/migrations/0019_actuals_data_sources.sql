-- supabase/migrations/0019_actuals_data_sources.sql — US-02, Lot L1, ADR-015
-- Source : docs/db-schema.md §10.6 (désignée `0016` dans la documentation — voir la note de
-- renumérotation en tête de `0018_data_connections.sql`).
--
-- Étend `session_logs`/`body_metrics` (F1, `0007_actuals.sql`) : charge réalisée, provenance
-- connectée, réconciliation, verrou de conformité. Migration additive, aucune réécriture de `0007`.

alter table session_logs
  add column data_connection_id  uuid references data_connections(id) on delete set null,
  add column external_activity_id text,
  add column started_at          timestamptz,            -- heure de début réelle (F3 : point de contact)
  add column session_type        session_type,           -- AC3 — séance hors plan
  add column load_units          int,                    -- CHARGE RÉALISÉE — calculée serveur
  add column distance_m          int,
  add column elevation_gain_m    int,
  add column excluded_at         timestamptz,            -- AC5 — exclusion, jamais suppression
  add column exclusion_reason    text,
  add column superseded_by_log_id uuid references session_logs(id) on delete set null,
  add column match_evidence      jsonb;                  -- règle d'appariement + confiance

alter table session_logs
  add constraint session_logs_exclusion_reason_values
    check (exclusion_reason is null
           or exclusion_reason in ('merged_duplicate','deleted_at_source','user_excluded')),
  add constraint session_logs_exclusion_coherent
    check ((excluded_at is null) = (exclusion_reason is null)),
  -- Une ligne 'connected' est toujours rattachable à la connexion qui l'a importée : c'est ce
  -- lien, et non une réécriture de `source`, qui porte la bascule d'affichage de l'AC10.
  add constraint session_logs_connected_has_connection
    check (source = 'declared' or data_connection_id is not null),
  add constraint session_logs_load_units_positive
    check (load_units is null or load_units >= 0);

-- Idempotence de l'import : un webhook rejoué, ou une réconciliation qui repasse sur la même
-- fenêtre, ne crée jamais un second enregistrement.
create unique index session_logs_external_activity
  on session_logs (data_connection_id, external_activity_id)
  where external_activity_id is not null;

-- Index de TOUS les agrégats (score hybride, Dashboard, PlanningContext) : un prédicat unique.
create index session_logs_counted_window
  on session_logs (user_id, logged_date desc)
  where excluded_at is null;

create index session_logs_connection
  on session_logs (data_connection_id) where data_connection_id is not null;

-- Point d'entrée par défaut des lectures d'agrégat : rend l'oubli du prédicat difficile.
-- `security_invoker` ⇒ les policies RLS de `session_logs` s'appliquent à l'appelant (PG15+).
create view session_logs_counted with (security_invoker = on) as
  select * from session_logs where excluded_at is null;
grant select on session_logs_counted to authenticated, service_role;

-- ADR-015 §4 — INSERT restreint colonne par colonne, comme UPDATE. `source`, `load_units`,
-- `data_connection_id`, `external_activity_id`, `excluded_at`, `exclusion_reason`,
-- `superseded_by_log_id`, `match_evidence`, `distance_m`, `elevation_gain_m` sont décidés
-- par le SERVEUR : une charge réalisée déclarée par le client serait un levier direct sur
-- les décisions de volume du moteur.
revoke insert on session_logs from authenticated;
grant insert (user_id, planned_session_id, logged_date, sport_id, session_type, started_at,
              completion, not_done_reason, actual_duration_min, rpe, freshness,
              pain, pain_zone, pain_at_rest, comment)
  on session_logs to authenticated;

-- Le GRANT UPDATE de 0007 reste valide et est étendu aux seuls champs déclaratifs ajoutés ici.
grant update (session_type, started_at) on session_logs to authenticated;

-- Symétrie sur `body_metrics` : aucune donnée connectée n'y est écrite en V1 (Strava n'expose
-- ni sommeil, ni FC de repos, ni VFC — ADR-013), mais le verrou est posé maintenant.
revoke insert on body_metrics from authenticated;
grant insert (user_id, measured_on, weight_kg, resting_hr, sleep_hours, hrv_ms)
  on body_metrics to authenticated;

-- CONFORMITÉ (ADR-013 §5). Les imports tournent en `service_role`, qui CONTOURNE RLS : la
-- garantie de consentement d'ADR-010 §2, portée par des policies, ne couvre pas ce chemin.
-- Un trigger, lui, s'applique à tous les rôles.
--
-- ÉCART DÉLIBÉRÉ par rapport au texte littéral de `docs/db-schema.md` §10.6 : ce dernier appelle
-- `public.has_active_consent(new.user_id, …)`. Vérifié en local (`developer`, Lot L1) : depuis
-- `0012_privilege_hardening.sql` (finding I11), `has_active_consent()` refuse de répondre pour un
-- `p_user` autre que `auth.uid()` (sauf `is_staff()`) — un garde-fou nécessaire pour son AUTRE usage
-- (RPC exposée à `authenticated`, `check-consents.ts`, qui ne doit jamais laisser un utilisateur
-- interroger le consentement d'un AUTRE utilisateur). Ce trigger tourne en `service_role`
-- (imports Strava) sans session `auth.uid()` : appeler la RPC durcie renverrait systématiquement
-- `false`, donc bloquerait TOUT import légitime — l'inverse de l'intention d'ADR-013 §5 (« le
-- trigger s'applique aussi au service_role, c'est tout son intérêt »). Ce trigger n'est, lui,
-- exposé à AUCUN rôle client (`revoke all … from public, anon, authenticated` ci-dessous) : c'est
-- un contrôle d'intégrité interne, pas une surface RPC, donc le garde-fou anti-énumération de
-- `has_active_consent()` ne s'y applique pas — il reproduit ici la même requête minimale (dernière
-- ligne `consents` par `granted_at`, `granted and revoked_at is null`) sans le filtre d'identité.
-- Signalé dans le rapport de fin de lot pour que `architect` mette à jour `docs/db-schema.md` §10.6.
create or replace function public.enforce_connected_source_consents() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_has_health_consent boolean;
  v_has_import_consent boolean;
begin
  if new.source = 'connected' then
    select coalesce((
      select c.granted and c.revoked_at is null
      from consents c
      where c.user_id = new.user_id and c.document_code = 'health_data_processing'
      order by c.granted_at desc
      limit 1
    ), false) into v_has_health_consent;

    select coalesce((
      select c.granted and c.revoked_at is null
      from consents c
      where c.user_id = new.user_id and c.document_code = 'third_party_data_import'
      order by c.granted_at desc
      limit 1
    ), false) into v_has_import_consent;

    if not v_has_health_consent then
      raise exception 'Import refusé (%): consentement au traitement des données de santé inactif.',
        tg_table_name using errcode = '42501';
    end if;
    if not v_has_import_consent then
      raise exception 'Import refusé (%): consentement à l''import depuis une source tierce inactif.',
        tg_table_name using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_connected_source_consents() from public, anon, authenticated;

create trigger session_logs_connected_consent before insert or update on session_logs
  for each row execute function enforce_connected_source_consents();
create trigger body_metrics_connected_consent before insert or update on body_metrics
  for each row execute function enforce_connected_source_consents();
