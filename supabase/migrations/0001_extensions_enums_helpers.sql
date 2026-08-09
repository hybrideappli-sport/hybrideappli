-- supabase/migrations/0001_extensions_enums_helpers.sql
-- Source : docs/db-schema.md §0 (DDL canonique — ne pas diverger sans mise à jour de l'architecture).
-- `08-architecture.md` §5 conserve les conventions de sécurité et renvoie à docs/db-schema.md pour
-- le détail des tables (extrait le 2026-08-07, arbitrage `architect` post-revue Lot L1).
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

-- Modèle de privilèges (ADR-012 §3, révision `architect` du 2026-08-07 — finding R4 de l'audit
-- Lot L1 : `plan_diffs`/`notifications` étaient intégralement réécrivables par leur propriétaire).
-- RLS est la barrière de sécurité, mais Postgres exige un GRANT au niveau objet AVANT d'évaluer
-- les policies. Le comportement legacy qui exposait automatiquement toute nouvelle table du
-- schéma `public` aux rôles API est déprécié (`config.toml` → `[api].auto_expose_new_tables`,
-- retrait le 2026-10-30) : on déclare donc des privilèges par défaut explicites.
--
-- RÈGLE STRUCTURANTE (ADR-012) :
--   SELECT / INSERT / DELETE sont intégralement exprimables par une policy RLS
--     ⇒ accordés par défaut à `authenticated`, RLS fait office de barrière.
--   UPDATE ne l'est PAS : une policy RLS ne sait pas restreindre les COLONNES écrites.
--     ⇒ UPDATE n'est JAMAIS accordé par défaut. Il est accordé table par table, et au niveau
--       colonne dès que seule une partie de la ligne est légitimement modifiable par l'utilisateur.
--     ⇒ un oubli de GRANT échoue bruyamment (`permission denied`), au lieu de sur-autoriser en silence.
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, delete on tables to authenticated;   -- PAS d'UPDATE : voir ci-dessus
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon, service_role;

-- Fonctions : Postgres accorde EXECUTE à PUBLIC par défaut. On retire ce défaut et on accorde
-- explicitement, fonction par fonction. Sans cela, toute fonction `security definer` créée plus
-- tard (p. ex. `erase_account`) serait appelable par `authenticated` dès sa création.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;

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

-- Blocage d'immuabilité, utilisé par les tables append-only.
--
-- UNIQUE DÉROGATION (ADR-010 §8, arbitrage `architect` du 2026-08-07 — finding R1 de l'audit
-- Lot L1) : le contexte d'effacement RGPD. Il exige simultanément
--   (a) le GUC de session `app.erasure_user_id` positionné sur l'utilisateur EXACT de la ligne,
--       ce qui interdit tout déverrouillage global ; et
--   (b) un rôle effectif membre de `service_role` (donc jamais `authenticated` ni `anon`,
--       même si l'un d'eux parvenait à positionner le GUC — les GUC de namespace applicatif
--       sont modifiables par n'importe quel rôle en Postgres : ce n'est PAS une barrière).
-- Le GUC est positionné en `set local` par `erase_account()` (`0002_identity_consents.sql`) :
-- sa portée est la transaction.
create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
declare
  v_ctx text := nullif(current_setting('app.erasure_user_id', true), '');
  v_row text := to_jsonb(old) ->> 'user_id';   -- générique : ne présuppose pas la colonne
begin
  if v_ctx is not null
     and v_row is not null
     and v_ctx = v_row
     and pg_has_role(current_user, 'service_role', 'member')
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception 'Table % is append-only (immutable record)', tg_table_name
    using errcode = '42501';
end $$;

-- Consentement actif : dernier enregistrement pour ce code, accordé et non révoqué.
-- L'EXISTENCE du document référencé est garantie par la FK composite sur `consents` (ADR-012 §1) :
-- inutile de la revérifier ici. La bascule vers une nouvelle version de document ne périme
-- volontairement PAS le consentement en cours (le re-consentement est un parcours produit).
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
revoke all on function public.has_active_consent(uuid, text) from public, anon;
grant execute on function public.has_active_consent(uuid, text) to authenticated, service_role;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = (select auth.uid()) and p.role = 'staff');
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated, service_role;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
