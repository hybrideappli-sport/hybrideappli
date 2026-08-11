-- supabase/migrations/0007_actuals.sql
-- Le réalisé n'est JAMAIS versionné et survit à toute régénération — ADR-004 §1
-- Source : docs/db-schema.md §6 (DDL canonique, arbitrage `architect` du 2026-08-07)

create table session_logs (                                -- AC4. DONNÉES DE SANTÉ.
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  planned_session_id uuid references planned_sessions(id) on delete set null,  -- nullable !
  logged_date        date not null,
  sport_id           uuid references sports(id),
  completion         completion_status not null,
  not_done_reason    text,                                 -- AC4 — pas de rattrapage, on comprend
  actual_duration_min int,
  rpe                smallint check (rpe between 1 and 10),
  freshness          smallint check (freshness between 1 and 5),
  pain               pain_level not null default 'none',
  pain_zone          body_zone,
  pain_at_rest       boolean not null default false,       -- AC9 niveau 3 : effort ET repos
  comment            text,
  source             data_source not null default 'declared',  -- anticipation F2
  created_at         timestamptz not null default now(),
  constraint pain_zone_required check (pain = 'none' or pain_zone is not null)
);
alter table session_logs enable row level security;
create policy "session_logs_select_own" on session_logs for select to authenticated using (user_id = (select auth.uid()));
create policy "session_logs_insert_own" on session_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
-- Consentement exigé à l'UPDATE aussi (ADR-010 §2, ADR-012 §2).
create policy "session_logs_update_own" on session_logs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and has_active_consent((select auth.uid()), 'health_data_processing'));
grant update (planned_session_id, logged_date, sport_id, completion, not_done_reason,
              actual_duration_min, rpe, freshness, pain, pain_zone, pain_at_rest, comment)
  on session_logs to authenticated;   -- `source` exclu : un client ne se déclare pas 'connected'
create index session_logs_window on session_logs (user_id, logged_date desc);
create index session_logs_pain   on session_logs (user_id, pain_zone, logged_date desc) where pain <> 'none';

create table nutrition_checkins (                          -- AC4, AC11 — saisie légère uniquement
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  nutrition_day_id uuid references nutrition_days(id) on delete set null,
  date             date not null,
  adherence        adherence_level not null,
  energy           smallint not null check (energy between 1 and 5),
  comment          text,
  created_at       timestamptz not null default now(),
  unique (user_id, date)
);
alter table nutrition_checkins enable row level security;
-- `energy` est un indicateur de fatigue exploité par le diagnostic de surcharge (AC6) :
-- traité comme donnée de santé, au même titre que `session_logs`. ADR-012 §2.
create policy "nutrition_checkins_select_own" on nutrition_checkins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "nutrition_checkins_insert_own" on nutrition_checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
create policy "nutrition_checkins_update_own" on nutrition_checkins for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and has_active_consent((select auth.uid()), 'health_data_processing'));
-- DELETE volontairement non couvert : le réalisé ne se supprime pas (ADR-004 §1).
grant update (adherence, energy, comment, nutrition_day_id) on nutrition_checkins to authenticated;

create table body_metrics (                                -- DONNÉES DE SANTÉ. Prêt pour F2.
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5,2),
  resting_hr   smallint,
  sleep_hours  numeric(3,1),
  hrv_ms       smallint,
  source       data_source not null default 'declared',
  created_at   timestamptz not null default now(),
  unique (user_id, measured_on, source)
);
alter table body_metrics enable row level security;
create policy "body_metrics_select_own" on body_metrics for select to authenticated using (user_id = (select auth.uid()));
create policy "body_metrics_insert_own" on body_metrics for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
-- Aucune policy UPDATE, aucun GRANT UPDATE : une mesure se corrige par une nouvelle ligne.

create table pain_episodes (                               -- AC9 — machine à états, écrite par le moteur
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  zone               body_zone not null,
  level              pain_protocol_level not null,
  consecutive_signals smallint not null default 1,
  first_signal_on    date not null,
  last_signal_on     date not null,
  zone_blocked       boolean not null default false,
  referral_issued    boolean not null default false,
  referral_issued_at timestamptz,
  resolved_at        timestamptz,
  explanation_id     uuid references explanations(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table pain_episodes enable row level security;
create policy "pain_episodes_select_own" on pain_episodes for select to authenticated using (user_id = (select auth.uid()));
create unique index pain_episodes_open on pain_episodes (user_id, zone) where resolved_at is null;
create trigger pain_episodes_touch before update on pain_episodes for each row execute function touch_updated_at();

create table stagnation_diagnoses (                        -- AC6, AC7
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  evaluated_on     date not null,
  window_start     date not null,
  window_end       date not null,
  weeks_available  smallint not null,                      -- AC7 : < 4 ⇒ calibration
  status           stagnation_status not null,
  indicator        text,                                   -- 'time'|'load'|'weight'|'energy'
  diagnosis        stagnation_diagnosis,
  evidence         jsonb not null default '{}'::jsonb,
  recommended_action text,
  plan_version_id  uuid references plan_versions(id),
  explanation_id   uuid references explanations(id),
  engine_run_id    uuid references engine_runs(id),
  created_at       timestamptz not null default now(),
  unique (user_id, evaluated_on),
  -- AC6 : jamais de durcissement en réponse à une inobservance
  constraint no_hardening_on_nonadherence
    check (diagnosis <> 'nonadherence' or recommended_action <> 'increase_load')
);
alter table stagnation_diagnoses enable row level security;
create policy "stagnation_select_own"   on stagnation_diagnoses for select to authenticated using (user_id = (select auth.uid()));
create policy "stagnation_select_staff" on stagnation_diagnoses for select to authenticated using (is_staff());
create index stagnation_recent on stagnation_diagnoses (user_id, evaluated_on desc);
