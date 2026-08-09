-- supabase/migrations/0004_onboarding.sql
-- Source : docs/db-schema.md §3 (DDL canonique, arbitrage `architect` du 2026-08-07 — R4 :
-- `alter default privileges` (0001) n'accorde plus UPDATE par défaut, GRANTs explicites ci-dessous)

create table onboarding_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'in_progress',   -- 'in_progress'|'completed'|'abandoned'
  current_step   onboarding_step not null default 'intro',
  profile_draft  jsonb not null default '{}'::jsonb,    -- extraction structurée, NON persistée en profil
  turn_count     int not null default 0,
  llm_model      text,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now()
);
alter table onboarding_sessions enable row level security;
create policy "onboarding_sessions_own" on onboarding_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- UPDATE pleine largeur assumé : `profile_draft` est un BROUILLON sans autorité. L'AC1 impose
-- que l'utilisateur valide explicitement son profil à l'étape `complete` — ce que le client
-- pourrait écrire ici, il le soumet de toute façon dans `confirmedProfile`.
grant update on onboarding_sessions to authenticated;
create trigger onboarding_sessions_touch before update on onboarding_sessions for each row execute function touch_updated_at();

create table onboarding_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references onboarding_sessions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('coach','user','system')),
  content       text not null,
  step          onboarding_step,
  extraction    jsonb,                                  -- patch de profile_draft produit par le LLM
  is_reformulation boolean not null default false,      -- état d'erreur `04-flow.md`
  contains_health_data boolean not null default false,  -- ADR-010 §3 — rétention alignée
  latency_ms    int,
  created_at    timestamptz not null default now()
);
alter table onboarding_messages enable row level security;
-- Journal conversationnel : append-only de fait. SELECT + INSERT, pas d'UPDATE ni de GRANT UPDATE.
create policy "onboarding_messages_select_own" on onboarding_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "onboarding_messages_insert_own" on onboarding_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create index onboarding_messages_session on onboarding_messages (session_id, created_at);
