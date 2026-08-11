-- supabase/migrations/0008_billing_paywall.sql — ADR-008, ADR-009
-- Source : docs/db-schema.md §7 (DDL canonique). Aucun changement de fond lors de l'arbitrage
-- `architect` du 2026-08-07 (les 4 points de l'audit Lot L1 ne concernaient pas ce fichier).

create table subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text,           -- miroir Stripe : active|trialing|past_due|canceled|incomplete
  tier                   subscription_tier not null default 'free',
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now(),
  created_at             timestamptz not null default now()
);
alter table subscriptions enable row level security;
create policy "subscriptions_select_own" on subscriptions for select to authenticated using (user_id = (select auth.uid()));
-- Aucune policy d'écriture, aucun GRANT UPDATE : seul le webhook (service_role) écrit ici.
create trigger subscriptions_touch before update on subscriptions for each row execute function touch_updated_at();

create table stripe_events (                               -- idempotence webhook — ADR-009 §2
  id           text primary key,          -- id d'événement Stripe
  type         text not null,
  api_version  text,
  event_created timestamptz not null,
  payload      jsonb not null,
  processed_at timestamptz,
  error        text
);
alter table stripe_events enable row level security;
-- Aucune policy : table strictement service_role.

create table free_access_events (                          -- ADR-008 : journal, pas compteur
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  accessed_on       date not null,                          -- date locale utilisateur
  first_accessed_at timestamptz not null default now(),
  surface           text not null,                          -- 'dashboard'|'today'
  unique (user_id, accessed_on)                             -- 1 accès = 1 JOURNÉE (H2)
);
alter table free_access_events enable row level security;
create policy "free_access_select_own" on free_access_events for select to authenticated using (user_id = (select auth.uid()));
-- Écriture service_role uniquement : le quota n'est jamais manipulable par le client.
create index free_access_window on free_access_events (user_id, accessed_on desc);
