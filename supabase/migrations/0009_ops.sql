-- supabase/migrations/0009_ops.sql — ADR-011
-- Source : 08-architecture.md §5.8 (DDL canonique)

create table job_queue (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,          -- 'weekly_review'|'objective_check'|'notification'
  user_id         uuid references auth.users(id) on delete cascade,
  idempotency_key text not null unique,   -- 'weekly_review:{user}:2026-W32'
  payload         jsonb not null default '{}'::jsonb,
  scheduled_for   timestamptz not null,
  status          job_status not null default 'pending',
  attempts        smallint not null default 0,
  locked_at       timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);
alter table job_queue enable row level security;
-- Aucune policy : table strictement service_role.
create index job_queue_drain on job_queue (status, scheduled_for) where status = 'pending';

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,             -- 'weekly_review_ready'|'pain_referral'|'objective_reached'|'payment_failed'
  channel    notification_channel not null,
  title      text not null,
  body       text not null,
  deep_link  text,
  payload    jsonb not null default '{}'::jsonb,
  sent_at    timestamptz,
  read_at    timestamptz,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;
create policy "notifications_select_own" on notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications_read_own"   on notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index notifications_unread on notifications (user_id, created_at desc) where read_at is null;

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "push_subscriptions_own" on push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Revue qualité asynchrone du fondateur (fiche §4) — contrôle qualité EXTERNE sur un moteur autonome
create table plan_reviews (
  id              uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references plan_versions(id) on delete cascade,
  reviewer_id     uuid not null references auth.users(id),
  status          text not null default 'pending',   -- 'pending'|'approved'|'flagged'
  findings        text,
  severity        text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (plan_version_id, reviewer_id)
);
alter table plan_reviews enable row level security;
create policy "plan_reviews_staff" on plan_reviews for all to authenticated
  using (is_staff()) with check (is_staff());
