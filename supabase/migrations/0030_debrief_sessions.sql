-- supabase/migrations/0030_debrief_sessions.sql — US-05, Lot L1, ADR-019
--
-- Recueil post-séance conversationnel : le coach relance après une séance et recueille les
-- signaux en conversation, là où le formulaire de `/aujourdhui` restait vide.
--
-- Delta additif : un enum, deux tables, aucune modification de l'existant. `session_logs` n'est
-- PAS touchée — le Lot L1 s'arrête au brouillon conversationnel, l'écriture du réalisé arrive au
-- Lot L2 (ADR-019 §Découpage).
--
-- POURQUOI DES TABLES DÉDIÉES plutôt qu'un élargissement de `onboarding_sessions`/
-- `onboarding_messages` (ADR-019 §4) : ces dernières portent `onboarding_step` et une sémantique
-- de construction de profil qui ne s'applique pas ici. Surtout, ADR-010 §3 traite
-- `contains_health_data` message par message — un débrief parle systématiquement de douleur, donc
-- porte systématiquement de la donnée de santé, là où un message d'onboarding n'en porte
-- qu'occasionnellement. D'où le `default true` ci-dessous, inverse de celui d'onboarding.

create type debrief_status as enum ('in_progress', 'completed', 'abandoned');

-- ---------------------------------------------------------------------------
-- `debrief_sessions` — une conversation, une séance planifiée.
-- ---------------------------------------------------------------------------
-- L'unicité sur `planned_session_id` matérialise la décision produit du 2026-09-25 : deux séances
-- le même jour sont deux efforts distincts, avec deux ressentis. `rpe` et `freshness` qualifient
-- UNE séance, jamais une journée — les fusionner ferait perdre la granularité que le moteur
-- attend. La contrainte garantit qu'aucun chemin de code ne pourra les confondre.
create table debrief_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  planned_session_id uuid not null unique references planned_sessions(id) on delete cascade,
  status             debrief_status not null default 'in_progress',
  -- Brouillon accumulé au fil des tours, JAMAIS le réalisé : il n'a pas valeur de `session_logs`
  -- tant que `CreateSessionLogInputSchema` ne l'a pas validé (Lot L2). Même rôle que
  -- `onboarding_sessions.profile_draft`, qui n'est pas non plus un profil.
  draft              jsonb not null default '{}'::jsonb,
  turn_count         int not null default 0,
  llm_model          text,
  -- Renseigné au Lot L2, dès que le trio obligatoire (`completion` + `pain` + `pain_zone` si
  -- nécessaire) a produit une ligne. Permet de distinguer « conversation en cours sans log » de
  -- « conversation en cours mais déjà écrite », le cas central de l'écriture précoce.
  session_log_id     uuid references session_logs(id) on delete set null,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  updated_at         timestamptz not null default now()
);
alter table debrief_sessions enable row level security;
create policy "debrief_sessions_own" on debrief_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant update on debrief_sessions to authenticated;
create trigger debrief_sessions_touch before update on debrief_sessions
  for each row execute function touch_updated_at();

-- Relance à 20 h locale (ADR-019 §7) : le job cherche les séances du jour sans débrief abouti.
create index debrief_sessions_user_status on debrief_sessions (user_id, status);

-- ---------------------------------------------------------------------------
-- `debrief_messages` — journal conversationnel, append-only de fait.
-- ---------------------------------------------------------------------------
create table debrief_messages (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references debrief_sessions(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  role                 text not null check (role in ('coach', 'user', 'system')),
  content              text not null,
  -- Patch de `draft` produit par le LLM, APRÈS validation Zod. Une extraction non conforme n'est
  -- jamais persistée : le tour est requalifié en reformulation (patron `runOnboardingTurn()`).
  extraction           jsonb,
  is_reformulation     boolean not null default false,
  -- `default true`, à l'inverse d'`onboarding_messages` : un débrief interroge systématiquement la
  -- douleur, donc tout message de ce fil est présumé porter de la donnée de santé (ADR-010 §3).
  -- Présumer l'inverse ferait dépendre la rétention d'une détection heuristique par message.
  contains_health_data boolean not null default true,
  latency_ms           int,
  created_at           timestamptz not null default now()
);
alter table debrief_messages enable row level security;
-- SELECT + INSERT uniquement, pas d'UPDATE ni de GRANT UPDATE : un échange passé ne se réécrit
-- pas. Même patron que `onboarding_messages`.
create policy "debrief_messages_select_own" on debrief_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "debrief_messages_insert_own" on debrief_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create index debrief_messages_session on debrief_messages (session_id, created_at);
