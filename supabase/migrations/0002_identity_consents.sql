-- supabase/migrations/0002_identity_consents.sql
-- Source : docs/db-schema.md §1 (DDL canonique, arbitrage `architect` du 2026-08-07 sur 4 points
-- remontés par `code-reviewer` après le Lot L1 — voir le journal des révisions en fin de ce fichier).

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
create policy "profiles_insert_own" on profiles for insert to authenticated with check (id = (select auth.uid()));
-- `role` est exclu du GRANT colonne ci-dessous : l'escalade de privilège est interdite par le
-- privilège, pas par un `with check (role = 'athlete')` — lequel empêchait par ailleurs un
-- compte `staff` de modifier son propre profil (finding M4, audit Lot L1).
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (display_name, timezone, locale, unit_system, onboarding_status)
  on profiles to authenticated;
create trigger profiles_touch before update on profiles for each row execute function touch_updated_at();

-- Sans ce trigger, un utilisateur fraîchement inscrit (email/password ou futur provider OAuth)
-- n'a une ligne dans `auth.users` que côté GoTrue : `is_staff()` renvoie systématiquement `false`
-- silencieusement (aucune ligne `profiles` à lire) et `profiles.timezone` — la source unique pour
-- les calculs de semaine/rituel dominical (ADR-008, ADR-011, risque R9 du plan) — n'existe pour
-- personne tant qu'un écran applicatif ne l'a pas créée à la main. `security definer` : le
-- propriétaire de la fonction (le rôle des migrations) est aussi propriétaire de `profiles`, donc
-- l'insertion contourne RLS sans avoir besoin d'une policy dédiée à `supabase_auth_admin` ou
-- similaire. Couvre aussi les futurs providers OAuth (Feature 2+), qui ne passent jamais par les
-- Server Actions applicatives (finding I9, audit Lot L1 — addition locale, absente de
-- docs/db-schema.md qui ne couvre que le point d'arbitrage `architect` du 2026-08-07).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

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
-- Aucune policy d'écriture : référentiel `service_role`. Aucun GRANT UPDATE.

-- Registre de preuve du consentement. Append-only.
-- Un retrait crée une nouvelle ligne (`granted = false`), jamais une mise à jour.
--
-- PAS de FK vers `auth.users` (ADR-010 §8) : ce registre SURVIT à la suppression du compte,
-- sous forme pseudonyme, comme preuve du consentement recueilli (art. 7.1 et 5.2 RGPD,
-- art. 17.3.e pour la défense de droits). `user_id` reste l'identifiant pseudonyme du sujet.
-- Rétention confirmée par le fondateur : 5 ans après suppression du compte (ADR-010, question
-- ouverte n°4) — le job de purge programmée est hors périmètre du Lot L1.
--
-- FK composite vers `consent_documents` (ADR-012 §1) : un consentement ne peut pas référencer
-- un document qui n'existe pas. Combiné à l'absence de policy INSERT, un utilisateur ne peut
-- plus s'auto-délivrer une preuve de consentement aux données de santé.
create table consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  document_code    text not null,
  document_version text not null,
  locale           text not null default 'fr',
  granted          boolean not null,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  ip_hash          text,          -- calculé côté serveur, jamais fourni par le client
  user_agent       text,          -- idem
  subject_erased_at timestamptz,  -- compte supprimé : ligne dépersonnalisée, conservée (ADR-010 §8)
  created_at       timestamptz not null default now(),
  constraint consents_document_fk
    foreign key (document_code, document_version, locale)
    references consent_documents (code, version, locale) on delete restrict
);
alter table consents enable row level security;
create policy "consents_select_own" on consents for select to authenticated using (user_id = (select auth.uid()));
-- AUCUNE policy INSERT/UPDATE/DELETE : l'écriture passe exclusivement par `service_role`
-- (`POST /api/v1/consents`, `POST /api/v1/consents/:code/revoke`, acquittement du disclaimer),
-- qui résout lui-même la version courante du document (`is_current`) et calcule `ip_hash`
-- et `user_agent` à partir de la requête. ADR-012 §1.
create trigger consents_immutable before update or delete on consents for each row execute function forbid_mutation();
create index consents_lookup on consents (user_id, document_code, granted_at desc);
create index consents_retention on consents (subject_erased_at) where subject_erased_at is not null;

-- Effacement d'un compte — art. 17 RGPD. ADR-010 §8.
-- Seule voie d'écriture sur les tables immuables. `security definer` (propriétaire `postgres`),
-- exécutable par `service_role` uniquement, appelée par `POST /api/v1/account/delete`.
create or replace function public.erase_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consents int;
begin
  -- `security definer` : `current_user`/`session_user` valent ici le PROPRIÉTAIRE de la fonction
  -- (le rôle des migrations, membre de `service_role` sur Supabase), jamais l'appelant réel — un
  -- contrôle sur `current_user` est donc TOUJOURS vrai, quel que soit qui appelle réellement cette
  -- fonction (finding B1, second audit `code-reviewer`, démontré en exécution). Seule la
  -- revendication `role` du JWT effectivement présenté par l'appelant (posée par PostgREST dans
  -- `request.jwt.claims`, ou explicitement par un appelant `service_role` en connexion directe —
  -- voir `packages/db/src/__tests__/integration/support/test-clients.ts`) reflète l'identité réelle.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'erase_account: insufficient privilege' using errcode = '42501';
  end if;

  -- Ouvre le contexte d'effacement : CETTE transaction, CET utilisateur. `set local`.
  perform set_config('app.erasure_user_id', p_user::text, true);

  -- 1) Registre de preuve : conservé, dissocié du compte, dépersonnalisé.
  --    `ip_hash` et `user_agent` sont les seuls résidus identifiants une fois le lien rompu :
  --    ils sont effacés. Le fait juridiquement probant (quel texte, quelle version, quand,
  --    accordé ou retiré) est conservé.
  update consents
     set ip_hash = null,
         user_agent = null,
         subject_erased_at = now()
   where user_id = p_user
     and subject_erased_at is null;
  get diagnostics v_consents = row_count;

  -- 2) Suppression du compte : cascade sur l'INTÉGRALITÉ des données personnelles
  --    (profil, plans, versions, traces, runs, logs, explications, notifications, quota…).
  delete from auth.users where id = p_user;

  return jsonb_build_object(
    'user_id', p_user,
    'consents_retained', v_consents,
    'erased_at', now()
  );
end $$;
revoke all on function public.erase_account(uuid) from public, anon, authenticated;
grant execute on function public.erase_account(uuid) to service_role;

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
-- Aucune policy UPDATE, aucun GRANT UPDATE : la résolution d'un flag est un acte `service_role`.
create index risk_flags_active on risk_flags (user_id) where is_active;

-- ============================================================================================
-- Journal des révisions (aligné sur docs/db-schema.md)
--
-- 2026-08-07 — arbitrage `architect` post-revue du Lot L1 (4 points `code-reviewer`) :
--   R1 — `forbid_mutation()` (0001) admet désormais la dérogation d'effacement RGPD ; `consents`
--        n'a plus de FK vers `auth.users` et survit à la suppression du compte (pseudonymisé).
--   R2 — FK composite `consents` → `consent_documents` + retrait de `consents_insert_own` :
--        écriture exclusivement `service_role`.
--   R4 — `alter default privileges` (0001) n'accorde plus UPDATE par défaut : `profiles` reçoit
--        un GRANT UPDATE au niveau colonne, `role` exclu.
--
-- 2026-08-09 — corrections `developer` suite au second audit `code-reviewer` (Lot L1) :
--   B1 — `erase_account()` vérifie désormais la revendication `role` du JWT de l'appelant
--        (`request.jwt.claims`), plus `current_user` (toujours `postgres` sous `security definer`,
--        donc toujours membre de `service_role` — le contrôle précédent ne vérifiait rien).
-- ============================================================================================
