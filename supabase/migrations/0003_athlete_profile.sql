-- supabase/migrations/0003_athlete_profile.sql
-- Source : docs/db-schema.md §2 (DDL canonique, arbitrage `architect` du 2026-08-07)

-- Référentiel « tous sports confondus » (fiche §1) — extensible sans migration de code
create table sports (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,          -- 'running','trail','cycling','triathlon','strength','dance',...
  label_fr     text not null,
  family       text not null,                 -- 'endurance' | 'strength' | 'mixed' | 'skill'
  default_muscle_groups muscle_group[] not null default '{}',
  is_documented boolean not null default true, -- false ⇒ plan générique prudent (question ouverte n°7)
  created_at   timestamptz not null default now()
);
alter table sports enable row level security;
create policy "sports_read" on sports for select to authenticated using (true);

create table athlete_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  birth_date         date,                     -- santé/AC3 (détection mineur)
  sex_at_birth       text,                     -- nécessaire aux planchers caloriques AC11
  height_cm          numeric(5,1),
  experience_level   text not null,            -- 'beginner'|'intermediate'|'advanced'
  training_years     numeric(4,1),
  declared_weekly_sessions int,
  declared_weekly_hours    numeric(4,1),
  training_history   jsonb not null default '{}'::jsonb,
  nutrition_habits   jsonb not null default '{}'::jsonb,
  dietary_constraints text[] not null default '{}',
  data_regime        data_regime not null default 'cold',    -- AC12 — piloté serveur, pas client
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table athlete_profiles enable row level security;
create policy "athlete_profiles_select_own" on athlete_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "athlete_profiles_write_own"  on athlete_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
-- Le consentement santé conditionne l'INSERT **et l'UPDATE** : un retrait de consentement
-- ferme la modification, il ne se contente pas de fermer la création. ADR-010 §2, ADR-012 §2.
create policy "athlete_profiles_update_own" on athlete_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and has_active_consent((select auth.uid()), 'health_data_processing'));
grant update (birth_date, sex_at_birth, height_cm, experience_level, training_years,
              declared_weekly_sessions, declared_weekly_hours, training_history,
              nutrition_habits, dietary_constraints)
  on athlete_profiles to authenticated;   -- `data_regime` exclu : décidé serveur (AC12 / F2)
create trigger athlete_profiles_touch before update on athlete_profiles for each row execute function touch_updated_at();

create table athlete_sports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  sport_id          uuid not null references sports(id),
  level             text not null,
  priority          smallint not null default 1,     -- AC10 : arbitrage d'interférence
  weekly_sessions_declared int,
  years_practice    numeric(4,1),
  is_primary        boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (user_id, sport_id)
);
alter table athlete_sports enable row level security;
create policy "athlete_sports_own" on athlete_sports for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update on athlete_sports to authenticated;   -- intégralement déclaratif

-- Disponibilités déclaratives captées en F1, consommées par F3 (fiche §5 « bloque d'autres US »)
create table availability_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),
  slot        day_slot not null default 'unspecified',
  max_minutes int,
  is_available boolean not null default true,
  source      text not null default 'declared',
  created_at  timestamptz not null default now()
);
alter table availability_slots enable row level security;
create policy "availability_own" on availability_slots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update on availability_slots to authenticated;   -- intégralement déclaratif

create table objectives (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  sport_id              uuid references sports(id),
  kind                  text not null,          -- 'race'|'performance'|'body_composition'|'general_fitness'
  label                 text not null,
  target_date           date,
  target_metric         jsonb not null default '{}'::jsonb,
  status                objective_status not null default 'draft',
  feasibility           feasibility_status,
  feasibility_trace_id  uuid,                   -- → decision_traces (AC2)
  proposed_alternative  jsonb,                  -- proposition de négociation (AC2)
  user_decision         text,                   -- 'accepted_proposal'|'kept_original'|null
  parent_objective_id   uuid references objectives(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table objectives enable row level security;
create policy "objectives_select_own" on objectives for select to authenticated using (user_id = (select auth.uid()));
create policy "objectives_insert_own" on objectives for insert to authenticated with check (user_id = (select auth.uid()));
create policy "objectives_update_own" on objectives for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Seuls les champs DÉCLARATIFS sont modifiables par le client. `status`, `feasibility`,
-- `feasibility_trace_id`, `proposed_alternative` et `user_decision` portent le verdict AC2
-- du moteur : ils transitent par `POST /objectives/:id/negotiation` (`service_role`).
-- Sans ce GRANT colonne, un utilisateur pouvait écrire `feasibility = 'realistic'` lui-même.
grant update (label, target_date, target_metric, sport_id, kind) on objectives to authenticated;
create index objectives_active on objectives (user_id, status, target_date);
create trigger objectives_touch before update on objectives for each row execute function touch_updated_at();
