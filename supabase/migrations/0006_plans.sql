-- supabase/migrations/0006_plans.sql — ADR-004, ADR-005
-- Source : docs/db-schema.md §5 (DDL canonique, arbitrage `architect` du 2026-08-07)

create table plans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  objective_id       uuid not null references objectives(id),
  status             text not null default 'active',   -- 'active'|'archived'
  current_version_id uuid,
  started_on         date not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table plans enable row level security;
create policy "plans_select_own" on plans for select to authenticated using (user_id = (select auth.uid()));
create unique index plans_one_active_per_user on plans (user_id) where status = 'active';

create table plan_versions (
  id                    uuid primary key default gen_random_uuid(),
  plan_id               uuid not null references plans(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  version_number        int  not null,
  trigger               plan_trigger not null,
  supersedes_version_id uuid references plan_versions(id),
  is_weekly_baseline    boolean not null default false,   -- ADR-005 §3
  ruleset_version       text not null references rulesets(version),
  engine_run_id         uuid not null references engine_runs(id),
  input_snapshot        jsonb not null,
  input_snapshot_hash   text  not null,
  snapshot              jsonb not null,                   -- plan intégral calculé
  horizon_start         date not null,
  horizon_end           date not null,
  created_at            timestamptz not null default now(),
  unique (plan_id, version_number)
);
alter table plan_versions enable row level security;
create policy "plan_versions_select_own"   on plan_versions for select to authenticated using (user_id = (select auth.uid()));
create policy "plan_versions_select_staff" on plan_versions for select to authenticated using (is_staff());
create trigger plan_versions_immutable before update or delete on plan_versions for each row execute function forbid_mutation();
create index plan_versions_plan     on plan_versions (plan_id, version_number desc);
create index plan_versions_baseline on plan_versions (plan_id, created_at desc) where is_weekly_baseline;
create unique index plan_versions_idempotency on plan_versions (plan_id, input_snapshot_hash, ruleset_version);

create table plan_blocks (                                 -- MACRO — AC1, AC13 (réservé abonnés)
  id              uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references plan_versions(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  block_index     int  not null,
  block_type      block_type not null,
  start_date      date not null,
  end_date        date not null,
  focus           text,
  target_load_units int,
  created_at      timestamptz not null default now(),
  unique (plan_version_id, block_index)
);
alter table plan_blocks enable row level security;
create policy "plan_blocks_select_own" on plan_blocks for select to authenticated using (user_id = (select auth.uid()));

create table plan_weeks (                                  -- MÉSO / MICRO
  id                        uuid primary key default gen_random_uuid(),
  plan_version_id           uuid not null references plan_versions(id) on delete cascade,
  plan_block_id             uuid references plan_blocks(id) on delete cascade,
  user_id                   uuid not null references auth.users(id) on delete cascade,
  week_start                date not null,                 -- lundi, fuseau utilisateur
  iso_week                  text not null,                 -- '2026-W32'
  detail_level              detail_level not null,
  is_deload                 boolean not null default false, -- AC8 — non désactivable
  target_load_units         int not null,
  planned_intense_sessions  smallint not null default 0,    -- AC8 — plafond
  max_consecutive_days_without_rest smallint,               -- AC8 — vérifié
  notes                     text,
  created_at                timestamptz not null default now(),
  unique (plan_version_id, week_start)
);
alter table plan_weeks enable row level security;
create policy "plan_weeks_select_own" on plan_weeks for select to authenticated using (user_id = (select auth.uid()));
create index plan_weeks_lookup on plan_weeks (user_id, week_start);

create table planned_sessions (                            -- JOUR — accès libre limité au jour courant (AC13)
  id              uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references plan_versions(id) on delete cascade,
  plan_week_id    uuid not null references plan_weeks(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  sport_id        uuid references sports(id),
  scheduled_date  date not null,
  slot            day_slot not null default 'unspecified',  -- l'heure appartient à F3
  order_in_day    smallint not null default 1,
  session_type    session_type not null,
  detail_level    detail_level not null,                    -- 'detailed' J→J+7 | 'intent' J+8→J+14
  duration_min    int,
  load_units      int not null,
  intensity_zone  text,
  prescription    jsonb,                                    -- null si detail_level='intent'
  muscle_groups   muscle_group[] not null default '{}',     -- AC10 — interférence
  interference_note text,                                   -- AC10 — mention dans l'explication
  explanation_id  uuid references explanations(id),
  created_at      timestamptz not null default now()
);
alter table planned_sessions enable row level security;
create policy "planned_sessions_select_own" on planned_sessions for select to authenticated using (user_id = (select auth.uid()));
create index planned_sessions_today   on planned_sessions (user_id, scheduled_date);
create index planned_sessions_version on planned_sessions (plan_version_id, scheduled_date);

create table nutrition_days (                              -- AC11
  id                uuid primary key default gen_random_uuid(),
  plan_version_id   uuid not null references plan_versions(id) on delete cascade,
  plan_week_id      uuid not null references plan_weeks(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  modulation_reason text not null,                          -- 'rest'|'endurance'|'intensity'
  kcal_target       int not null,
  kcal_safety_floor int not null,                           -- plancher explicite — AC11
  protein_g         int not null,
  carbs_g           int not null,
  fat_g             int not null,
  hydration_ml      int,
  advice_pre        text,
  advice_during     text,
  advice_post       text,
  explanation_id    uuid references explanations(id),
  created_at        timestamptz not null default now(),
  unique (plan_version_id, date),
  constraint nutrition_floor_respected check (kcal_target >= kcal_safety_floor)
);
alter table nutrition_days enable row level security;
create policy "nutrition_days_select_own" on nutrition_days for select to authenticated using (user_id = (select auth.uid()));
create index nutrition_days_lookup on nutrition_days (user_id, date);

create table plan_diffs (                                  -- AC5
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  plan_id               uuid not null references plans(id) on delete cascade,
  from_version_id       uuid references plan_versions(id),   -- null = première semaine
  to_version_id         uuid not null references plan_versions(id),
  items                 jsonb not null,                      -- PlanDiffItem[] — ADR-005 §4
  summary_explanation_id uuid references explanations(id),
  acknowledged_at       timestamptz,
  created_at            timestamptz not null default now(),
  unique (to_version_id)
);
alter table plan_diffs enable row level security;
create policy "plan_diffs_select_own" on plan_diffs for select to authenticated using (user_id = (select auth.uid()));
create policy "plan_diffs_ack_own"    on plan_diffs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- `acknowledged_at` est la SEULE colonne acquittable. Une policy RLS ne sait pas le dire :
-- c'est le GRANT colonne qui protège `items` (contenu produit par le moteur, `decisionTraceId`
-- inclus) contre une réécriture par l'utilisateur. ADR-012 §3.
grant update (acknowledged_at) on plan_diffs to authenticated;
create index plan_diffs_recent on plan_diffs (user_id, created_at desc);
