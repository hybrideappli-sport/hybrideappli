-- supabase/migrations/0002_identity_consents.sql
-- Source : 08-architecture.md §5.1 (DDL canonique)

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  role          user_role     not null default 'athlete',
  timezone      text          not null default 'Europe/Paris',   -- ADR-008, ADR-011
  locale        text          not null default 'fr',
  unit_system   text          not null default 'metric',
  onboarding_status text      not null default 'not_started',
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
alter table profiles enable row level security;
create policy "profiles_select_own" on profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()) and role = 'athlete');
create policy "profiles_insert_own" on profiles for insert to authenticated with check (id = (select auth.uid()));
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();

-- Texte exact de chaque document, versionné et immuable — ADR-010
create table consent_documents (
  code         text not null,      -- 'medical_disclaimer' | 'health_data_processing' | 'terms' | 'privacy'
  version      text not null,
  locale       text not null default 'fr',
  title        text not null,
  body_md      text not null,
  checksum     text not null,
  published_at timestamptz not null default now(),
  is_current   boolean not null default false,
  primary key (code, version, locale)
);
alter table consent_documents enable row level security;
create policy "consent_documents_read" on consent_documents for select to authenticated using (true);
create unique index consent_documents_current on consent_documents (code, locale) where is_current;

-- Append-only : un retrait crée une nouvelle ligne
create table consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  document_code    text not null,
  document_version text not null,
  locale           text not null default 'fr',
  granted          boolean not null,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  ip_hash          text,
  user_agent       text,
  created_at       timestamptz not null default now()
);
alter table consents enable row level security;
create policy "consents_select_own" on consents for select to authenticated using (user_id = (select auth.uid()));
create policy "consents_insert_own" on consents for insert to authenticated with check (user_id = (select auth.uid()));
create trigger consents_immutable before update or delete on consents for each row execute function forbid_mutation();
create index consents_lookup on consents (user_id, document_code, granted_at desc);

-- Profils à risque — AC3. Données sensibles.
create table risk_flags (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  flag_type     risk_flag_type not null,
  declared_at   timestamptz not null default now(),
  source        text not null default 'onboarding',
  notes_enc     bytea,                     -- pgcrypto, clé hors base — ADR-010
  restrictions  jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
alter table risk_flags enable row level security;
create policy "risk_flags_select_own" on risk_flags for select to authenticated using (user_id = (select auth.uid()));
create policy "risk_flags_insert_own" on risk_flags for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
create index risk_flags_active on risk_flags (user_id) where is_active;
