-- supabase/migrations/0001_extensions_enums_helpers.sql
-- Source : 08-architecture.md §5.0 (DDL canonique — ne pas diverger sans mise à jour de l'architecture)
create extension if not exists "pgcrypto";

-- Note technique (developer, Lot L1) : `has_active_consent()` et `is_staff()` ci-dessous
-- référencent respectivement `consents` et `profiles`, créées seulement en migration 0002.
-- Postgres valide par défaut le corps des fonctions SQL/PL-pgSQL contre le catalogue au moment
-- du `CREATE FUNCTION` (`check_function_bodies`), ce qui casse cette référence en avant. On
-- désactive cette vérification pour la durée de la migration — pratique standard documentée par
-- Postgres pour ce cas exact ("a function's body refers to a table that does not exist yet").
-- Aucune sémantique de schéma n'est modifiée ; la vérification réelle a lieu à la première
-- exécution de la fonction, une fois toutes les migrations appliquées.
set check_function_bodies = off;

-- Note technique (developer, Lot L1) : GRANTs de schéma, absents du DDL canonique de
-- `08-architecture.md` §5 (qui ne couvre que tables/policies/triggers). RLS est la véritable
-- barrière de sécurité (§8), mais Postgres exige aussi un GRANT au niveau objet avant même
-- d'évaluer les policies — y compris pour `service_role`, qui contourne RLS (`BYPASSRLS`) mais
-- pas les GRANTs. Le comportement legacy qui exposait automatiquement toute nouvelle table du
-- schéma `public` aux rôles API est déprécié (voir `supabase/config.toml`, section `[api]`,
-- `auto_expose_new_tables`, retrait prévu le 2026-10-30) — on ne s'y fie donc pas et on déclare
-- des privilèges par défaut explicites, appliqués automatiquement à toute table créée par la
-- suite dans ce schéma par les migrations suivantes (`alter default privileges`).
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, anon, service_role;

create type user_role            as enum ('athlete','staff');
create type onboarding_step      as enum ('intro','goal','level','history','sports','availability',
                                          'nutrition','risk_filter','disclaimer','health_consent',
                                          'review','completed');
create type risk_flag_type       as enum ('minor','pregnancy','pathology','eating_disorder_history','other');
create type objective_status     as enum ('draft','active','renegotiated','achieved','expired','abandoned');
create type feasibility_status   as enum ('realistic','stretch','unrealistic');
create type block_type           as enum ('base','build','specific','taper','transition','recovery');
create type detail_level         as enum ('detailed','intent','macro');
create type plan_trigger         as enum ('onboarding','objective_renegotiation','negative_signal',
                                          'pain_protocol','weekly_review','stagnation','objective_end','manual_admin');
create type session_type         as enum ('endurance','tempo','interval','long','strength','power',
                                          'mobility','technique','cross_training','rest');
create type day_slot             as enum ('am','pm','unspecified');
create type completion_status    as enum ('done','partial','not_done');
create type pain_level           as enum ('none','light','pain');
create type pain_protocol_level  as enum ('none','light','persistent','acute');
create type body_zone            as enum ('knee','ankle','foot','hip','lower_back','upper_back','shoulder',
                                          'elbow','wrist','neck','thigh','calf','chest','other');
create type muscle_group         as enum ('quads','hamstrings','glutes','calves','core','back','chest',
                                          'shoulders','arms','full_body','none');
create type adherence_level      as enum ('low','partial','high');
create type stagnation_diagnosis as enum ('understimulation','overload','nonadherence','inconclusive');
create type stagnation_status    as enum ('calibration','no_stagnation','stagnation');
create type explanation_source   as enum ('template','llm');
create type confidence_level     as enum ('high','calibrating','unknown');
create type data_source          as enum ('declared','connected');          -- anticipation F2
create type data_regime          as enum ('cold','declared','connected');   -- AC12
create type subscription_tier    as enum ('free','premium');
create type job_status           as enum ('pending','running','done','failed','abandoned');
create type notification_channel as enum ('push','email','in_app');

-- Blocage d'immuabilité, utilisé par les tables append-only
create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Table % is append-only (immutable record)', tg_table_name;
end $$;

-- Consentement actif : dernier enregistrement pour ce code, accordé et non révoqué
create or replace function public.has_active_consent(p_user uuid, p_code text)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.granted and c.revoked_at is null
    from consents c
    where c.user_id = p_user and c.document_code = p_code
    order by c.granted_at desc
    limit 1
  ), false);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'staff');
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
