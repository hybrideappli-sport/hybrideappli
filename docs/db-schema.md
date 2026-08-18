# Schéma de base de données — Hybride Club

> **DDL canonique. Ce fichier fait foi.** `developer` aligne `supabase/migrations/**` dessus, `tester` en dérive les tests RLS / immuabilité / privilèges, `code-reviewer` s'y réfère.
>
> Extrait de `08-architecture.md` §5 le **2026-08-07**, à l'occasion de l'arbitrage `architect` sur les 4 points remontés par `code-reviewer` après le Lot L1. `08-architecture.md` §5 conserve les **conventions de sécurité** (qui restent la lecture d'entrée) et renvoie ici pour le détail des tables.
>
> **Étendu le 2026-08-12** par `architect` pour l'US-02 (centralisation des données + score hybride) : voir **§10**, qui porte l'intégralité du delta F2 sous forme de migrations additives (`0015` → `0018`). Les sections §0 à §9 décrivent le schéma F1 et **ne sont pas modifiées** : les altérations de `session_logs` et `body_metrics` sont exprimées en `alter table` dans §10, conformément à la convention d'empilement de migrations en vigueur depuis `0011`.
>
> **Étendu à nouveau le 2026-08-12** par `architect` pour l'US-03 (placement horaire et imprévus) : voir **§11**, delta additif sous forme de migrations `0019` → `0020`. Les sections §0 à §10 **ne sont pas modifiées** : l'US-03 n'altère aucune table existante.
>
> **Amendé le 2026-08-12** (même journée, amendement d'ADR-017 §8-§9) : restitution et acquittement du `not_done` automatique — une colonne, une contrainte, une policy et deux index sur `schedule_incidents`, table de l'US-03 elle-même. Voir **§11.8**. `session_logs` reste inchangée.
>
> Décisions associées : ADR-004, ADR-005, ADR-006, ADR-007, ADR-008, ADR-009, **ADR-010** (RGPD / effacement), ADR-011, **ADR-012** (modèle de privilèges), **ADR-013** (synchronisation Strava), **ADR-014** (score hybride), **ADR-015** (réconciliation déclaré/connecté), **ADR-016** (placement horaire dérivé), **ADR-017** (clôture d'imprévu).
>
> Voir le [journal des révisions](#journal-des-révisions) en fin de document.

34 tables en F1, 41 après l'US-02, **43 après l'US-03**. **RLS activée sur toutes, sans exception**, avec au moins une policy explicite.

Conventions appliquées uniformément :

- **Tables utilisateur** (saisies, profil) : `SELECT/INSERT/UPDATE` par le propriétaire.
- **Tables produites par le moteur** (plans, traces, explications, diagnostics) : `SELECT` par le propriétaire **uniquement**. Aucune policy d'écriture ⟹ écriture réservée au `service_role`. L'utilisateur ne peut jamais fabriquer un plan ou une trace.
- **Tables immuables** (`plan_versions`, `decision_traces`, `consents`) : trigger `BEFORE UPDATE OR DELETE` levant une exception, **y compris pour le `service_role`** — à l'unique exception du contexte d'effacement RGPD (ADR-010 §8).
- **Référentiels** (`sports`, `consent_documents`, `rulesets`, `data_providers`, `external_sport_mappings`) : `SELECT` pour `authenticated`, écriture `service_role`.
- **Tables de santé** (`athlete_profiles`, `session_logs`, `body_metrics`, `risk_flags`, `nutrition_checkins`) : policies `INSERT` **et `UPDATE`** conditionnées au consentement actif (ADR-010 §2, ADR-012 §2).
- **Consentements** : écriture **exclusivement `service_role`** (route API dédiée). Aucune policy `INSERT` pour `authenticated` (ADR-012 §1).
- **Privilège `UPDATE`** : jamais accordé par défaut, accordé table par table et **au niveau colonne** dès que seule une partie de la ligne est légitimement modifiable (ADR-012 §3).
- **Privilège `INSERT`** : accordé par défaut, **sauf** sur une table dont au moins une colonne est décidée par le serveur ; il y est alors énuméré colonne par colonne, exactement comme `UPDATE` (ADR-015 §4 — amendement d'ADR-012 §3).

---

## 0. Extensions, enums, privilèges et fonctions utilitaires

```sql
-- supabase/migrations/0001_extensions_enums_helpers.sql
create extension if not exists "pgcrypto";

-- `has_active_consent()` et `is_staff()` référencent `consents` et `profiles`, créées en 0002.
-- Postgres valide le corps des fonctions contre le catalogue au CREATE FUNCTION : on désactive
-- cette vérification pour la durée de la migration (pratique documentée pour les références
-- en avant). La vérification réelle a lieu à la première exécution, migrations appliquées.
set check_function_bodies = off;
```

### 0.1 Modèle de privilèges (ADR-012 §3)

```sql
-- RLS est la barrière de sécurité, mais Postgres exige un GRANT au niveau objet AVANT
-- d'évaluer les policies. Le comportement legacy qui exposait automatiquement toute nouvelle
-- table du schéma `public` aux rôles API est déprécié (`config.toml` → `[api].auto_expose_new_tables`,
-- retrait le 2026-10-30) : on déclare donc des privilèges par défaut explicites.
--
-- RÈGLE STRUCTURANTE (ADR-012) :
--   SELECT / INSERT / DELETE sont intégralement exprimables par une policy RLS
--     ⇒ accordés par défaut à `authenticated`, RLS fait office de barrière.
--   UPDATE ne l'est PAS : une policy RLS ne sait pas restreindre les COLONNES écrites.
--     ⇒ UPDATE n'est JAMAIS accordé par défaut. Il est accordé table par table, et au niveau
--       colonne dès que seule une partie de la ligne est légitimement modifiable par l'utilisateur.
--     ⇒ un oubli de GRANT échoue bruyamment (`permission denied`), au lieu de sur-autoriser en silence.
--
-- AMENDEMENT US-02 (ADR-015 §4) : la même limite vaut pour INSERT dès qu'une colonne de la table
-- est décidée par le SERVEUR (`session_logs.load_units`, `.source`, `.data_connection_id`…).
-- Le défaut ci-dessous est conservé, mais il est RÉVOQUÉ puis ré-accordé colonne par colonne sur
-- ces tables-là (§10.6).

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
```

### 0.2 Enums

```sql
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
```

> Les enums ajoutés par l'US-02 (`data_connection_status`, `sync_trigger`, `sync_status`, `hybrid_score_status`) sont déclarés en §10.1, dans la migration `0015` — jamais rétro-insérés dans `0001`.

### 0.3 Fonctions utilitaires

```sql
-- Immuabilité des tables append-only.
--
-- UNIQUE DÉROGATION (ADR-010 §8) : le contexte d'effacement RGPD. Il exige simultanément
--   (a) le GUC de session `app.erasure_user_id` positionné sur l'utilisateur EXACT de la ligne,
--       ce qui interdit tout déverrouillage global ; et
--   (b) un rôle effectif membre de `service_role` (donc jamais `authenticated` ni `anon`,
--       même si l'un d'eux parvenait à positionner le GUC — les GUC de namespace applicatif
--       sont modifiables par n'importe quel rôle en Postgres : ce n'est PAS une barrière).
-- Le GUC est positionné en `set local` par `erase_account()` : sa portée est la transaction.
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
```

---

## 1. Identité et conformité

```sql
-- supabase/migrations/0002_identity_consents.sql

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
-- compte `staff` de modifier son propre profil.
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant update (display_name, timezone, locale, unit_system, onboarding_status)
  on profiles to authenticated;
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
-- Aucune policy d'écriture : référentiel `service_role`. Aucun GRANT UPDATE.
-- `is_current` est le document EN VIGUEUR, et son activation dépend de l'environnement :
-- voir §9.3 (elle n'est PAS posée uniformément partout — ADR-010 §9).

-- Registre de preuve du consentement. Append-only.
-- Un retrait crée une nouvelle ligne (`granted = false`), jamais une mise à jour.
--
-- PAS de FK vers `auth.users` (ADR-010 §8) : ce registre SURVIT à la suppression du compte,
-- sous forme pseudonyme, comme preuve du consentement recueilli (art. 7.1 et 5.2 RGPD,
-- art. 17.3.e pour la défense de droits). `user_id` reste l'identifiant pseudonyme du sujet.
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
  if not pg_has_role(current_user, 'service_role', 'member') then
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
```

---

## 2. Profil sportif et objectif

```sql
-- supabase/migrations/0003_athlete_profile.sql

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
```

---

## 3. Onboarding conversationnel

```sql
-- supabase/migrations/0004_onboarding.sql

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
-- Une seule session `in_progress` par utilisateur (correction Lot L3, voir Journal des révisions
-- 2026-08-10) : sans cette contrainte, deux créations concurrentes peuvent produire deux sessions
-- « en cours », et la lecture « la session courante » (tri `started_at desc limit 1`) peut alors
-- résoudre la mauvaise — un profil vide au récap plutôt que celui réellement rempli par le chat.
create unique index onboarding_sessions_one_in_progress on onboarding_sessions (user_id) where status = 'in_progress';

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
```

---

## 4. Moteur, paramètres et audit

```sql
-- supabase/migrations/0005_engine_audit.sql

-- ADR-007 — paramètres de sécurité versionnés, immuables
create table rulesets (
  version      text primary key,             -- semver
  params       jsonb not null,
  source_refs  jsonb not null default '{}'::jsonb,
  checksum     text not null,
  is_active    boolean not null default false,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,  -- survit à l'effacement du publieur
  notes        text,
  created_at   timestamptz not null default now()
);
alter table rulesets enable row level security;
create policy "rulesets_read" on rulesets for select to authenticated using (true);
create unique index rulesets_single_active on rulesets ((is_active)) where is_active;
-- NB : l'activation d'une version se fait par insertion d'une nouvelle ligne puis bascule
-- via une fonction service_role dédiée (audit tracé), jamais par UPDATE applicatif.
-- Aucun GRANT UPDATE à `authenticated`.

create table engine_runs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  trigger             plan_trigger not null,
  ruleset_version     text not null references rulesets(version),
  input_snapshot_hash text not null,
  status              text not null default 'running',   -- 'running'|'succeeded'|'failed'
  error               text,
  duration_ms         int,
  output_plan_version_id uuid,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);
alter table engine_runs enable row level security;
create policy "engine_runs_select_own" on engine_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "engine_runs_select_staff" on engine_runs for select to authenticated using (is_staff());
create index engine_runs_user on engine_runs (user_id, started_at desc);

-- ADR-006 — traçabilité machine. Immuable.
create table decision_traces (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  engine_run_id    uuid not null references engine_runs(id) on delete cascade,
  plan_version_id  uuid,
  ruleset_version  text not null,
  rule_id          text not null,
  rule_version     text not null,
  category         text not null,        -- 'guardrail'|'progression'|'interference'|'nutrition'
                                         -- |'pain'|'stagnation'|'feasibility'|'risk_restriction'|'calibration'
                                         -- |'hybrid_score' (US-02, ADR-014)
  is_hard_guardrail boolean not null default false,
  scope            text not null,        -- 'plan'|'block'|'week'|'session'|'nutrition_day'|'objective'|'pain_zone'
                                         -- |'hybrid_score' (US-02)
  -- `text`, PAS `uuid` (correction Lot L3, `developer`, 2026-08-10 — voir Journal des révisions) :
  -- `DecisionTrace.scopeRefId` (@hybride/domain) est un `string | null` générique, pas toujours un
  -- UUID (ex. index de bloc macro sérialisé, `String(blockIndex)`).
  scope_ref_id     text,
  scope_ref_date   date,
  condition_expr   text not null,
  inputs_used      jsonb not null,       -- [{source_table, source_id, field, value, observed_on}]
  output           jsonb not null,       -- {field, before, after, direction}
  severity         text not null default 'info',
  created_at       timestamptz not null default now()
);
alter table decision_traces enable row level security;
create policy "decision_traces_select_own"   on decision_traces for select to authenticated using (user_id = (select auth.uid()));
create policy "decision_traces_select_staff" on decision_traces for select to authenticated using (is_staff());
create trigger decision_traces_immutable before update or delete on decision_traces for each row execute function forbid_mutation();
create index decision_traces_run       on decision_traces (engine_run_id);
create index decision_traces_version   on decision_traces (plan_version_id);
create index decision_traces_scope     on decision_traces (user_id, scope, scope_ref_id);
create index decision_traces_guardrail on decision_traces (ruleset_version, rule_id) where is_hard_guardrail;

-- ADR-006 — texte destiné à l'utilisateur
create table explanations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  subject_type       text not null,       -- 'planned_session'|'nutrition_day'|'plan_diff'|'plan_diff_item'
                                          -- |'stagnation_diagnosis'|'objective_feasibility'|'pain_episode'|'plan_version'
                                          -- |'hybrid_score' (US-02, ADR-014)
  subject_id         uuid not null,
  short_text         text not null,       -- AC1
  long_text          text,                -- AC5 « en savoir plus »
  locale             text not null default 'fr',
  generated_by       explanation_source not null,
  llm_model          text,
  llm_prompt_hash    text,
  numeric_integrity_ok boolean not null default true,   -- ADR-002 §3
  fallback_used      boolean not null default false,
  confidence         confidence_level not null default 'high',  -- AC7
  decision_trace_ids uuid[] not null,
  created_at         timestamptz not null default now(),
  constraint explanations_must_be_grounded check (array_length(decision_trace_ids, 1) >= 1)
);
alter table explanations enable row level security;
create policy "explanations_select_own"   on explanations for select to authenticated using (user_id = (select auth.uid()));
create policy "explanations_select_staff" on explanations for select to authenticated using (is_staff());
create index explanations_subject on explanations (subject_type, subject_id);
create index explanations_quality on explanations (created_at desc) where fallback_used or not numeric_integrity_ok;
```

---

## 5. Plan (macro / méso / micro) et diff

```sql
-- supabase/migrations/0006_plans.sql — ADR-004, ADR-005

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
```

---

## 6. Réalisé, douleur, stagnation

> **US-02** : `session_logs` et `body_metrics` sont **étendues** par la migration `0016` (§10.6) — charge réalisée, provenance connectée, réconciliation. Le DDL ci-dessous reste celui de la F1 ; lire §10.6 pour l'état final.

```sql
-- supabase/migrations/0007_actuals.sql
-- Le réalisé n'est JAMAIS versionné et survit à toute régénération — ADR-004 §1

create table session_logs (                                -- AC4. DONNÉES DE SANTÉ.
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  planned_session_id uuid references planned_sessions(id) on delete set null,  -- nullable !
  logged_date        date not null,
  sport_id           uuid references sports(id),
  completion         completion_status not null,
  not_done_reason    text,                                 -- AC4 — pas de rattrapage, on comprend
  actual_duration_min int,
  rpe                smallint check (rpe between 1 and 10),
  freshness          smallint check (freshness between 1 and 5),
  pain               pain_level not null default 'none',
  pain_zone          body_zone,
  pain_at_rest       boolean not null default false,       -- AC9 niveau 3 : effort ET repos
  comment            text,
  source             data_source not null default 'declared',  -- anticipation F2 — décidé serveur
  created_at         timestamptz not null default now(),
  constraint pain_zone_required check (pain = 'none' or pain_zone is not null)
);
alter table session_logs enable row level security;
create policy "session_logs_select_own" on session_logs for select to authenticated using (user_id = (select auth.uid()));
create policy "session_logs_insert_own" on session_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
-- Consentement exigé à l'UPDATE aussi (ADR-010 §2, ADR-012 §2).
create policy "session_logs_update_own" on session_logs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and has_active_consent((select auth.uid()), 'health_data_processing'));
grant update (planned_session_id, logged_date, sport_id, completion, not_done_reason,
              actual_duration_min, rpe, freshness, pain, pain_zone, pain_at_rest, comment)
  on session_logs to authenticated;   -- `source` exclu : un client ne se déclare pas 'connected'
create index session_logs_window on session_logs (user_id, logged_date desc);
create index session_logs_pain   on session_logs (user_id, pain_zone, logged_date desc) where pain <> 'none';

create table nutrition_checkins (                          -- AC4, AC11 — saisie légère uniquement
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  nutrition_day_id uuid references nutrition_days(id) on delete set null,
  date             date not null,
  adherence        adherence_level not null,
  energy           smallint not null check (energy between 1 and 5),
  comment          text,
  created_at       timestamptz not null default now(),
  unique (user_id, date)
);
alter table nutrition_checkins enable row level security;
-- `energy` est un indicateur de fatigue exploité par le diagnostic de surcharge (AC6) :
-- traité comme donnée de santé, au même titre que `session_logs`. ADR-012 §2.
create policy "nutrition_checkins_select_own" on nutrition_checkins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "nutrition_checkins_insert_own" on nutrition_checkins for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
create policy "nutrition_checkins_update_own" on nutrition_checkins for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and has_active_consent((select auth.uid()), 'health_data_processing'));
-- DELETE volontairement non couvert : le réalisé ne se supprime pas (ADR-004 §1).
grant update (adherence, energy, comment, nutrition_day_id) on nutrition_checkins to authenticated;

create table body_metrics (                                -- DONNÉES DE SANTÉ. Prêt pour F2.
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5,2),
  resting_hr   smallint,
  sleep_hours  numeric(3,1),
  hrv_ms       smallint,
  source       data_source not null default 'declared',
  created_at   timestamptz not null default now(),
  unique (user_id, measured_on, source)
);
alter table body_metrics enable row level security;
create policy "body_metrics_select_own" on body_metrics for select to authenticated using (user_id = (select auth.uid()));
create policy "body_metrics_insert_own" on body_metrics for insert to authenticated
  with check (user_id = (select auth.uid()) and has_active_consent((select auth.uid()), 'health_data_processing'));
-- Aucune policy UPDATE, aucun GRANT UPDATE : une mesure se corrige par une nouvelle ligne.

create table pain_episodes (                               -- AC9 — machine à états, écrite par le moteur
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  zone               body_zone not null,
  level              pain_protocol_level not null,
  consecutive_signals smallint not null default 1,
  first_signal_on    date not null,
  last_signal_on     date not null,
  zone_blocked       boolean not null default false,
  referral_issued    boolean not null default false,
  referral_issued_at timestamptz,
  resolved_at        timestamptz,
  explanation_id     uuid references explanations(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table pain_episodes enable row level security;
create policy "pain_episodes_select_own" on pain_episodes for select to authenticated using (user_id = (select auth.uid()));
create unique index pain_episodes_open on pain_episodes (user_id, zone) where resolved_at is null;
create trigger pain_episodes_touch before update on pain_episodes for each row execute function touch_updated_at();

create table stagnation_diagnoses (                        -- AC6, AC7
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  evaluated_on     date not null,
  window_start     date not null,
  window_end       date not null,
  weeks_available  smallint not null,                      -- AC7 : < 4 ⇒ calibration
  status           stagnation_status not null,
  indicator        text,                                   -- 'time'|'load'|'weight'|'energy'
  diagnosis        stagnation_diagnosis,
  evidence         jsonb not null default '{}'::jsonb,
  recommended_action text,
  plan_version_id  uuid references plan_versions(id),
  explanation_id   uuid references explanations(id),
  engine_run_id    uuid references engine_runs(id),
  created_at       timestamptz not null default now(),
  unique (user_id, evaluated_on),
  -- AC6 : jamais de durcissement en réponse à une inobservance
  constraint no_hardening_on_nonadherence
    check (diagnosis <> 'nonadherence' or recommended_action <> 'increase_load')
);
alter table stagnation_diagnoses enable row level security;
create policy "stagnation_select_own"   on stagnation_diagnoses for select to authenticated using (user_id = (select auth.uid()));
create policy "stagnation_select_staff" on stagnation_diagnoses for select to authenticated using (is_staff());
create index stagnation_recent on stagnation_diagnoses (user_id, evaluated_on desc);
```

---

## 7. Monétisation et paywall

```sql
-- supabase/migrations/0008_billing_paywall.sql — ADR-008, ADR-009

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
-- NB RGPD : `payload` peut contenir des données personnelles (e-mail de facturation). Cette
-- table n'est PAS purgée par `erase_account()` — rétention et purge à cadrer (ADR-010, §Q ouvertes).

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
```

---

## 8. Exploitation : jobs, notifications, revue qualité

```sql
-- supabase/migrations/0009_ops.sql — ADR-011

create table job_queue (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,          -- 'weekly_review'|'objective_check'|'notification'
                                          -- US-02 : |'strava_backfill'|'strava_activity_sync'|'strava_reconcile'
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
-- `read_at` est la SEULE colonne modifiable : `title`, `body`, `payload` et `deep_link` sont
-- produits par le serveur. ADR-012 §3.
grant update (read_at) on notifications to authenticated;
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
grant update on push_subscriptions to authenticated;   -- intégralement client (rotation d'endpoint)

-- Revue qualité asynchrone du fondateur (fiche §4) — contrôle qualité EXTERNE sur un moteur autonome
create table plan_reviews (
  id              uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references plan_versions(id) on delete cascade,
  reviewer_id     uuid references auth.users(id) on delete set null,  -- la revue survit à l'effacement
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
grant update on plan_reviews to authenticated;   -- gardé par is_staff()
```

---

## 9. Seeds

Deux fichiers, **deux rôles qu'il ne faut pas confondre** :

| Fichier | Rejoué où | Rôle |
|---|---|---|
| `supabase/migrations/0010_seed_referentials.sql` | **Partout** : local, preview, production (`supabase db reset` comme `supabase db push`) | Fait **exister** le référentiel. N'**active** jamais un contenu qui n'est pas validé pour la production. |
| `supabase/seed.sql` | **Hors production uniquement** : local (`supabase db reset` / `supabase start`, via `[db.seed]` de `config.toml`) et bases de branche *preview* | **Active** ce que la migration laisse volontairement inactif. Ne crée aucune ligne : uniquement des `UPDATE` de bascule. |

> **Portée réelle de `seed.sql` — vérifiée le 2026-08-09.** Supabase exécute `seed.sql` **aussi à la création d'une branche preview**, pas seulement en local ; en revanche seules les **migrations** sont propagées vers la base de production (« Data changes in your seed files are not merged to production »). La séparation migration/seed est donc une garantie **« jamais en production »**, et non « jamais sur un environnement distant ». Les commentaires d'en-tête de `supabase/seed.sql` qui affirment « JAMAIS exécuté sur un environnement distant (preview, prod) » sont **inexacts et à corriger** : la garantie qu'ils invoquent (ADR-007 — aucun ruleset `0.x` actif **en production**) tient toujours, mais son périmètre exact est la production, pas tout environnement distant. C'est aussi ce qui rend `seed.sql` apte à débloquer les environnements de test (preview, E2E CI), et pas seulement le poste du développeur.

### 9.1 `0010_seed_referentials.sql` — l'existence, partout

1. **`sports`** : référentiel initial multi-disciplines, `is_documented = true` pour ce lot initial (il est documenté par cette seed). Tout sport ajouté **ultérieurement**, hors de ce référentiel, doit être inséré avec `is_documented = false` par le code applicatif ⇒ le moteur applique un profil générique prudent (question ouverte n°7).
2. **`consent_documents`** : `medical_disclaimer`, `health_data_processing`, `terms`, `privacy` en version `1.0.0`, locale `fr` — insérés **`is_current = false`**. Contenu juridique **provisoire et non validé** (finding B3 de l'audit Lot L1) : aucune migration ne le promeut document en vigueur. Voir §9.3. `health_data_processing` porte en plus, depuis `0014_health_data_processing_consent_v1_1_0.sql`, une seconde version `1.1.0` (texte amendé, toujours provisoire, insérée `is_current = false` selon le même principe) — voir §9.4. L'US-02 ajoute un **cinquième code**, `third_party_data_import` — voir §10.8.
3. **`rulesets`** : `0.1.0-dev`, inséré **`is_active = false`** (finding B1). Les paramètres non tranchés restent `null` ⇒ le schéma Zod du Lot L2 refusera l'activation en production tant que les seuils AC8 ne sont pas fixés (ADR-007). L'US-02 publie `0.2.0-dev`, qui ajoute la section `hybrid_score` — voir §10.8.

### 9.2 `supabase/seed.sql` — l'activation, hors production

1. **`rulesets`** : bascule `0.1.0-dev` en `is_active = true` — **remplacée par `0.2.0-dev` à partir de l'US-02** (§10.8).
2. **`consent_documents`** : bascule `medical_disclaimer`, `terms`, `privacy` (`1.0.0` / `fr`), `health_data_processing` (`1.1.0` / `fr` depuis `0014_health_data_processing_consent_v1_1_0.sql` — §9.4) et, depuis l'US-02, `third_party_data_import` (`1.0.0` / `fr` — §10.8) en `is_current = true` (voir §9.3 pour la forme exacte à écrire, qui doit être défensive).

### 9.3 `is_current` : un prérequis **relatif à l'environnement**, pas un prérequis uniforme

> Arbitrage `architect` du **2026-08-09**, en réponse à la contradiction relevée par le second audit `code-reviewer` du Lot L1 entre ce document et l'implémentation. Décision tracée en **ADR-010 §9**.

**La contradiction.** Ce document affirmait, depuis la révision R2, que « le seed **doit** poser `is_current = true` sur la version courante de chaque `(code, locale)` », comme un prérequis dur uniforme. Le correctif B3 du premier audit a fait l'inverse : `is_current = false` partout, y compris en local, parce que le texte juridique est provisoire. Les deux affirmations ne peuvent pas être vraies en même temps, et l'implémentation avait raison sur le fond mais tort sur la portée : sans document courant, `POST /api/v1/consents` (qui résout `is_current`, ADR-012 §1) ne peut résoudre aucune version, donc aucun consentement santé n'est enregistrable, donc l'onboarding est bloqué — **y compris en local et en preview**, où aucune considération juridique ne le justifie.

**Deux mécanismes distincts, à ne pas confondre.** L'échec observé n'est pas celui que décrivait la formulation précédente :

| Mécanisme | Ce qu'il garantit | Ce qui se passe s'il manque |
|---|---|---|
| **FK composite** `consents (document_code, document_version, locale)` → `consent_documents` | Un consentement ne peut pas référencer un document **inexistant** | Rejet en base (`23503`) — c'est la garantie anti-auto-délivrance d'ADR-012 §1 |
| **`is_current`** | Désigne **la** version **en vigueur** pour un `(code, locale)` | La **route** n'a aucune version à résoudre : elle refuse **avant** d'atteindre la base. Ce n'est pas la FK qui rejette. |

La migration `0010` satisfait déjà le premier mécanisme partout : les 4 documents **existent** dans tous les environnements. Le prérequis dur qui reste est donc le second, et il est par nature **relatif à l'environnement** — « quel texte fait foi *ici* » n'a pas la même réponse sur un poste de développement et en production.

**Décision.**

- **Le prérequis dur se formule ainsi** : dans **tout environnement où l'onboarding doit fonctionner**, il doit exister exactement une ligne `is_current = true` par `(code, locale)` pour `medical_disclaimer`, `health_data_processing`, `terms` et `privacy`. Ce n'est pas une obligation faite à la migration, c'est une obligation faite à **l'environnement**.
- **Hors production** (local, preview) : `supabase/seed.sql` pose `is_current = true` sur `1.0.0` / `fr`. Le développement, les tests d'intégration et les E2E du Lot L2/L3 sont débloqués.
- **En production** : `is_current` reste `false` tant qu'une **migration dédiée** n'a pas publié une version **juridiquement validée**. Aucun `UPDATE` de confort, aucun basculement du texte provisoire. L'intention du correctif B3 est intégralement préservée : le seul environnement d'où `seed.sql` est structurellement absent est précisément celui qu'il fallait protéger.
- **Corollaire assumé** : tant que cette migration n'est pas livrée, **l'onboarding est bloqué en production, par construction**. Ce n'est pas un défaut à contourner, c'est le verrou B3 lui-même — on ne recueille pas un consentement RGPD art. 9 sur un texte que personne n'a validé. Ce blocage doit être **explicite** (voir « Contrat de la route » ci-dessous) et figurer à la checklist de mise en production.

**Forme à écrire dans `seed.sql` — l'activation doit être défensive.** Un `update … set is_current = true where version = '1.0.0'` inconditionnel est un piège à retardement : le jour où la migration d'activation juridique insère `1.0.1` avec `is_current = true`, le prochain `supabase db reset` local rejouerait le seed **après** cette migration et violerait l'index unique partiel `consent_documents_current (code, locale) where is_current` — `db reset` échouerait, en local et sur chaque branche preview. L'activation doit donc céder la place à toute version déjà en vigueur :

```sql
-- supabase/seed.sql — hors production uniquement. N'active QUE s'il n'existe pas déjà
-- un document en vigueur pour ce (code, locale) : une migration d'activation juridique
-- ultérieure (version validée, is_current = true) doit primer sans collision d'index.
update consent_documents d
   set is_current = true
 where d.version = '1.0.0'
   and d.locale  = 'fr'
   and d.code in ('medical_disclaimer','health_data_processing','terms','privacy')
   and not exists (
     select 1 from consent_documents c
      where c.code = d.code and c.locale = d.locale and c.is_current
   );
```

> **Même piège sur `rulesets`.** L'activation `update rulesets set is_active = true where version = '0.1.0-dev'` de `seed.sql` est aujourd'hui inconditionnelle et entrera en collision avec `rulesets_single_active` (index unique **global** sur `(is_active) where is_active`) dès qu'un ruleset `1.0.0` sera publié actif par migration. À rendre défensif de la même façon (`and not exists (select 1 from rulesets where is_active)`).

**Contrat de la route (Lot L2/L3), pour que le blocage production soit lisible.** `POST /api/v1/consents` et `POST /api/v1/onboarding/session/:id/disclaimer` résolvent la version courante. Si aucune ligne `is_current` n'existe pour le `(code, locale)` demandé, la route ne doit **ni** planter en `500`, **ni** insérer une version arbitraire : elle répond `503` avec le code d'erreur stable **`CONSENT_DOCUMENT_UNAVAILABLE`** (convention `08-architecture.md` §6) et journalise une alerte d'exploitation. Un environnement mal préparé se diagnostique alors en une ligne de log, au lieu de se manifester par un onboarding cassé sans explication.

**Ce que le contenu provisoire doit continuer de porter.** Les 4 textes conservent dans leur `body_md` la mention « *Contenu provisoire — à faire valider juridiquement avant mise en production* ». Comme l'UI affiche le corps du document lu en base, tout testeur d'une preview voit cette mention : activer le document hors production n'a jamais l'effet de faire passer un brouillon pour un texte définitif. Dette suivie en `08-architecture.md` §12, **question ouverte n°10** (et non n°8, que le commentaire actuel de `seed.sql` cite par erreur — n°8 porte sur la rétention du registre `consents`).

### 9.4 Précédent : `health_data_processing` diverge sur `1.1.0` (2026-08-11)

> `0014_health_data_processing_consent_v1_1_0.sql`. Décision tracée en **ADR-010 §10**.

Le mécanisme des §9.1-9.3 supposait implicitement que les 4 documents évolueraient toujours **ensemble**, sur la même version provisoire. `health_data_processing` en est le premier contre-exemple : son texte `1.0.0` promettait sans réserve que le retrait « entraîne la purge de ces données », devenu inexact après le correctif comportemental `576bbf2` (les `risk_flags` `pathology`/`minor` survivent désormais volontairement au retrait, pour préserver l'avertissement médical fixe d'AC3). Une nouvelle version `1.1.0` amende ce texte ; `medical_disclaimer`, `terms`, `privacy` restent sur `1.0.0`, inchangés.

Le mécanisme lui-même ne change pas : `1.1.0` est **insérée**, jamais une réécriture de `1.0.0` (immuabilité du registre, §1) ; elle reste, comme `1.0.0`, un texte **provisoire non validé juridiquement** (`is_current = false` posé par la migration elle-même, activation relative à l'environnement via `seed.sql` hors production). Ce qui change, c'est que `seed.sql` doit désormais poser **deux** clauses d'activation défensive distinctes sur `consent_documents` plutôt qu'une seule couvrant les 4 codes — chacune scopée à son propre `(code, version)`, pour ne jamais dépendre d'une hypothèse de version commune aux 4 documents qui ne tient plus.

Aucun re-consentement n'est déclenché pour les utilisateurs ayant déjà consenti à `1.0.0` : `has_active_consent()` ne teste que `document_code` (voir son commentaire dans `0001_extensions_enums_helpers.sql` — choix déjà assumé, la bascule de version ne périme pas le consentement en cours). C'est cohérent ici puisque le comportement système que `1.1.0` documente était déjà en vigueur pour tous, y compris pour qui a consenti à `1.0.0`, depuis `576bbf2`.

---

## 10. US-02 — Centralisation des données et score hybride

> Ajouté le **2026-08-12** par `architect`. Décisions : **ADR-013** (synchronisation Strava), **ADR-014** (score hybride), **ADR-015** (réconciliation déclaré/connecté).
>
> Delta **additif** : quatre migrations (`0015` → `0018`), aucune réécriture des migrations F1. Sept nouvelles tables, une vue, quatre enums, deux fonctions, un trigger de conformité.

### 10.1 Enums (migration `0015`)

```sql
-- supabase/migrations/0015_data_connections.sql — ADR-013

create type data_connection_status as enum ('pending','active','needs_reauth','revoked');
create type sync_trigger           as enum ('initial_backfill','webhook','scheduled_reconcile','manual');
create type sync_status            as enum ('running','succeeded','partial','failed');
create type hybrid_score_status    as enum ('calibration','available');
```

### 10.2 Référentiel des sources (`data_providers`)

Alimente l'écran Connexion données (une carte par source, design §3.3/§3.4) sans coder les sources dans le client : ajouter « Garmin » un jour sera une ligne, pas un déploiement.

```sql
create table data_providers (
  code           text primary key,          -- 'strava' | 'strength_manual' | 'nutrition_manual'
  label_fr       text not null,
  kind           text not null check (kind in ('oauth','manual')),
  description_fr text not null,             -- ligne 2 de la carte (design §3.4)
  is_available   boolean not null default true,
  display_order  smallint not null default 100,
  created_at     timestamptz not null default now()
);
alter table data_providers enable row level security;
create policy "data_providers_read" on data_providers for select to authenticated using (true);
-- Référentiel : écriture `service_role`, aucun GRANT UPDATE.
```

### 10.3 Connexions (`data_connections`) et jetons (`data_connection_secrets`)

```sql
-- État de connexion par (utilisateur, source). LISIBLE par son propriétaire : l'écran a besoin
-- du badge d'état, de la dernière synchro et du motif d'erreur. AUCUNE policy d'écriture :
-- une connexion se crée et se révoque exclusivement par une route serveur (ADR-013 §2).
create table data_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  provider_code         text not null references data_providers(code),
  status                data_connection_status not null default 'pending',
  external_account_id   text,                       -- Strava athlete id = `owner_id` des webhooks
  scopes                text[] not null default '{}',
  connected_at          timestamptz,
  last_synced_at        timestamptz,
  last_sync_status      sync_status,
  last_error_code       text,                       -- 'token_invalid'|'rate_limited'|'provider_error'
  backfill_completed_at timestamptz,
  revoked_at            timestamptz,
  revoked_reason        text check (revoked_reason in
                          ('user','provider_deauthorized','consent_withdrawn','token_invalid')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table data_connections enable row level security;
create policy "data_connections_select_own" on data_connections for select to authenticated
  using (user_id = (select auth.uid()));
-- Ni INSERT, ni UPDATE, ni DELETE pour `authenticated` : l'utilisateur ne se déclare pas connecté.
revoke insert, delete on data_connections from authenticated;
create trigger data_connections_touch before update on data_connections
  for each row execute function touch_updated_at();

-- Une seule connexion vivante par (utilisateur, source) ; les connexions révoquées s'empilent
-- comme historique et gardent le lien vers les séances qu'elles ont importées (ADR-015 §3).
create unique index data_connections_one_live_per_provider
  on data_connections (user_id, provider_code)
  where status in ('pending','active','needs_reauth');

-- Un compte tiers ne peut alimenter qu'un seul compte Hybride Club : sans cela, le routage
-- d'un webhook par `owner_id` serait ambigu.
create unique index data_connections_external_account
  on data_connections (provider_code, external_account_id)
  where external_account_id is not null and status <> 'revoked';

create index data_connections_active on data_connections (status, last_synced_at)
  where status = 'active';

-- Jetons OAuth. Table SÉPARÉE, sans aucune policy : `service_role` exclusivement (ADR-013 §2).
-- Le `revoke` explicite double l'absence de policy — les privilèges par défaut (§0.1) accordent
-- `select` à `authenticated` sur toute nouvelle table, et une policy ajoutée par erreur un jour
-- ne doit pas suffire à exposer un jeton d'accès à un compte tiers.
create table data_connection_secrets (
  data_connection_id       uuid primary key references data_connections(id) on delete cascade,
  access_token_enc         bytea not null,          -- pgcrypto, clé hors base (ADR-010 §5)
  refresh_token_enc        bytea not null,
  access_token_expires_at  timestamptz not null,
  refresh_locked_until     timestamptz,             -- bail exclusif de rafraîchissement
  rotated_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);
alter table data_connection_secrets enable row level security;
revoke all on table data_connection_secrets from authenticated, anon;
-- AUCUNE policy. Patron `stripe_events` / `job_queue`.

-- Rotation Strava : un nouveau refresh_token invalide immédiatement l'ancien. Deux
-- rafraîchissements concurrents (webhook + cron) casseraient la connexion. Bail exclusif,
-- même patron que `claim_job_queue()` (0011). ADR-013 §3.
create or replace function public.claim_connection_refresh(p_connection_id uuid, p_lease_seconds int)
returns boolean
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update data_connection_secrets
       set refresh_locked_until = now() + make_interval(secs => p_lease_seconds)
     where data_connection_id = p_connection_id
       and (refresh_locked_until is null or refresh_locked_until < now())
    returning data_connection_id
  )
  select exists (select 1 from claimed);
$$;
revoke all on function public.claim_connection_refresh(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_connection_refresh(uuid, int) to service_role;
```

### 10.4 Traçabilité des synchronisations (`sync_runs`)

Pendant de `engine_runs` pour l'import : une ligne par exécution, réussie ou non. C'est ce qui rend l'état « SYNCHRONISATION EN ÉCHEC » du design (§2.6) diagnosticable au lieu d'être un message générique.

```sql
create table sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  data_connection_id uuid not null references data_connections(id) on delete cascade,
  trigger            sync_trigger not null,
  window_start       timestamptz,
  window_end         timestamptz,
  status             sync_status not null default 'running',
  items_seen         int not null default 0,
  items_imported     int not null default 0,
  items_merged       int not null default 0,     -- AC5 — doublons résolus
  items_skipped      int not null default 0,
  items_failed       int not null default 0,
  external_cursor    text,                       -- epoch `after=` de la dernière page traitée
  rate_limit         jsonb,                      -- entêtes X-RateLimit-* du dernier appel (ADR-013)
  error_code         text,
  error_message      text,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz
);
alter table sync_runs enable row level security;
create policy "sync_runs_select_own"   on sync_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "sync_runs_select_staff" on sync_runs for select to authenticated using (is_staff());
-- Aucune policy d'écriture : produit par le serveur, comme `engine_runs`.
create index sync_runs_recent     on sync_runs (user_id, started_at desc);
create index sync_runs_connection on sync_runs (data_connection_id, started_at desc);
```

### 10.5 Cartographie des disciplines externes (`external_sport_mappings`)

```sql
-- Traduit un `sport_type` Strava vers le référentiel `sports` de la F1, et fournit le type de
-- séance par défaut nécessaire au calcul de `load_units` quand le log n'est rattaché à aucune
-- séance prévue (ADR-015 §1). `sport_id` nul ⇒ discipline non cartographiée : la séance est
-- importée sans discipline plutôt que rejetée (AC3 — jamais de blocage).
create table external_sport_mappings (
  provider_code        text not null references data_providers(code),
  external_code        text not null,          -- 'Run','TrailRun','Ride','Swim','WeightTraining',…
  sport_id             uuid references sports(id),
  default_session_type session_type not null default 'endurance',
  primary key (provider_code, external_code)
);
alter table external_sport_mappings enable row level security;
create policy "external_sport_mappings_read" on external_sport_mappings for select to authenticated using (true);
-- Référentiel : écriture `service_role`, aucun GRANT UPDATE.
```

### 10.6 Extension du réalisé (migration `0016`) — ADR-015

```sql
-- supabase/migrations/0016_actuals_data_sources.sql — ADR-015

alter table session_logs
  add column data_connection_id  uuid references data_connections(id) on delete set null,
  add column external_activity_id text,
  add column started_at          timestamptz,            -- heure de début réelle (F3 : point de contact)
  add column session_type        session_type,           -- AC3 — séance hors plan
  add column load_units          int,                    -- CHARGE RÉALISÉE — calculée serveur
  add column distance_m          int,
  add column elevation_gain_m    int,
  add column excluded_at         timestamptz,            -- AC5 — exclusion, jamais suppression
  add column exclusion_reason    text,
  add column superseded_by_log_id uuid references session_logs(id) on delete set null,
  add column match_evidence      jsonb;                  -- règle d'appariement + confiance

alter table session_logs
  add constraint session_logs_exclusion_reason_values
    check (exclusion_reason is null
           or exclusion_reason in ('merged_duplicate','deleted_at_source','user_excluded')),
  add constraint session_logs_exclusion_coherent
    check ((excluded_at is null) = (exclusion_reason is null)),
  -- Une ligne 'connected' est toujours rattachable à la connexion qui l'a importée : c'est ce
  -- lien, et non une réécriture de `source`, qui porte la bascule d'affichage de l'AC10.
  add constraint session_logs_connected_has_connection
    check (source = 'declared' or data_connection_id is not null),
  add constraint session_logs_load_units_positive
    check (load_units is null or load_units >= 0);

-- Idempotence de l'import : un webhook rejoué, ou une réconciliation qui repasse sur la même
-- fenêtre, ne crée jamais un second enregistrement.
create unique index session_logs_external_activity
  on session_logs (data_connection_id, external_activity_id)
  where external_activity_id is not null;

-- Index de TOUS les agrégats (score hybride, Dashboard, PlanningContext) : un prédicat unique.
create index session_logs_counted_window
  on session_logs (user_id, logged_date desc)
  where excluded_at is null;

create index session_logs_connection
  on session_logs (data_connection_id) where data_connection_id is not null;

-- Point d'entrée par défaut des lectures d'agrégat : rend l'oubli du prédicat difficile.
-- `security_invoker` ⇒ les policies RLS de `session_logs` s'appliquent à l'appelant (PG15+).
create view session_logs_counted with (security_invoker = on) as
  select * from session_logs where excluded_at is null;
grant select on session_logs_counted to authenticated, service_role;

-- ADR-015 §4 — INSERT restreint colonne par colonne, comme UPDATE. `source`, `load_units`,
-- `data_connection_id`, `external_activity_id`, `excluded_at`, `exclusion_reason`,
-- `superseded_by_log_id`, `match_evidence`, `distance_m`, `elevation_gain_m` sont décidés
-- par le SERVEUR : une charge réalisée déclarée par le client serait un levier direct sur
-- les décisions de volume du moteur.
revoke insert on session_logs from authenticated;
grant insert (user_id, planned_session_id, logged_date, sport_id, session_type, started_at,
              completion, not_done_reason, actual_duration_min, rpe, freshness,
              pain, pain_zone, pain_at_rest, comment)
  on session_logs to authenticated;

-- Le GRANT UPDATE de 0007 reste valide et est étendu aux seuls champs déclaratifs ajoutés ici.
grant update (session_type, started_at) on session_logs to authenticated;

-- Symétrie sur `body_metrics` : aucune donnée connectée n'y est écrite en V1 (Strava n'expose
-- ni sommeil, ni FC de repos, ni VFC — ADR-013), mais le verrou est posé maintenant.
revoke insert on body_metrics from authenticated;
grant insert (user_id, measured_on, weight_kg, resting_hr, sleep_hours, hrv_ms)
  on body_metrics to authenticated;

-- CONFORMITÉ (ADR-013 §5). Les imports tournent en `service_role`, qui CONTOURNE RLS : la
-- garantie de consentement d'ADR-010 §2, portée par des policies, ne couvre pas ce chemin.
-- Un trigger, lui, s'applique à tous les rôles.
create or replace function public.enforce_connected_source_consents() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'connected' then
    if not public.has_active_consent(new.user_id, 'health_data_processing') then
      raise exception 'Import refusé (%): consentement au traitement des données de santé inactif.',
        tg_table_name using errcode = '42501';
    end if;
    if not public.has_active_consent(new.user_id, 'third_party_data_import') then
      raise exception 'Import refusé (%): consentement à l''import depuis une source tierce inactif.',
        tg_table_name using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_connected_source_consents() from public, anon, authenticated;

create trigger session_logs_connected_consent before insert or update on session_logs
  for each row execute function enforce_connected_source_consents();
create trigger body_metrics_connected_consent before insert or update on body_metrics
  for each row execute function enforce_connected_source_consents();
```

### 10.7 Score hybride (migration `0017`) — ADR-014

```sql
-- supabase/migrations/0017_hybrid_scores.sql — ADR-014

create table hybrid_scores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  computed_for        date not null,                     -- date locale de l'utilisateur
  window_start        date not null,                     -- fenêtre chronique (28 j par défaut)
  window_end          date not null,
  status              hybrid_score_status not null,
  score               smallint check (score between 0 and 100),   -- NULL si calibration (AC8)
  components          jsonb not null default '{}'::jsonb, -- {volume:{raw,normalized},consistency:{…},diversity:{…}}
  weeks_available     smallint not null,                 -- AC8
  sessions_counted    smallint not null,
  disciplines_counted smallint not null,
  load_units_total    int not null,
  by_discipline       jsonb not null default '[]'::jsonb, -- [{sportId,sportCode,loadUnits,sharePct}]
  by_day              jsonb not null default '[]'::jsonb, -- 7 valeurs — histogramme design §4.3
  provenance          jsonb not null default '{}'::jsonb, -- {connected:n, declared:n} — glyphes AC6
  ruleset_version     text not null references rulesets(version),
  inputs_digest       text not null,                     -- idempotence, cf. plan_versions
  explanation_id      uuid references explanations(id),
  engine_run_id       uuid references engine_runs(id),
  created_at          timestamptz not null default now(),
  -- AC8 : en calibration, AUCUN chiffre n'est produit, même approximatif.
  constraint hybrid_scores_calibration_has_no_score
    check ((status = 'calibration') = (score is null)),
  unique (user_id, computed_for, inputs_digest)
);
alter table hybrid_scores enable row level security;
create policy "hybrid_scores_select_own"   on hybrid_scores for select to authenticated using (user_id = (select auth.uid()));
create policy "hybrid_scores_select_staff" on hybrid_scores for select to authenticated using (is_staff());
-- Aucune policy d'écriture : produit par le serveur à partir d'une fonction pure du moteur.
create index hybrid_scores_latest on hybrid_scores (user_id, computed_for desc, created_at desc);
```

### 10.8 Seeds US-02 (migration `0018`)

`supabase/migrations/0018_seed_data_sources.sql` — l'**existence**, partout :

1. **`data_providers`** : `strava` (`kind = 'oauth'`), `strength_manual`, `nutrition_manual` (`kind = 'manual'`), avec les libellés et descriptions du design §3.4.
2. **`external_sport_mappings`** : couverture des `sport_type` Strava usuels (`Run`, `TrailRun`, `Ride`, `GravelRide`, `MountainBikeRide`, `VirtualRide`, `Swim`, `WeightTraining`, `Workout`, `Hike`, `Rowing`, `Elliptical`), avec `default_session_type` (`endurance` pour l'endurance, `strength` pour `WeightTraining`, `cross_training` pour `Workout`).
3. **`consent_documents`** : `third_party_data_import`, version `1.0.0`, locale `fr`, inséré **`is_current = false`** — même régime que les 4 documents F1 (§9.3). Le corps porte la mention « *Contenu provisoire — à faire valider juridiquement avant mise en production* », énumère **exactement** les champs importés (ADR-013 §4), et indique explicitement ce que le retrait fait et ne fait pas (arrêt des imports, conservation de l'historique — AC10 — et les deux voies réelles d'effacement).
4. **`rulesets`** : version `0.2.0-dev`, `is_active = false`, reprenant `0.1.0-dev` **plus** la section `hybrid_score` (ADR-014 §1). `0.1.0-dev` n'est ni modifiée ni supprimée (ADR-007 §1).

`supabase/seed.sql` — l'**activation**, hors production, avec la même clause défensive qu'en §9.3, et **une clause par `(code, version)`** conformément à la leçon de §9.4 :

```sql
update consent_documents d
   set is_current = true
 where d.code = 'third_party_data_import' and d.version = '1.0.0' and d.locale = 'fr'
   and not exists (select 1 from consent_documents c
                    where c.code = d.code and c.locale = d.locale and c.is_current);

update rulesets r set is_active = true
 where r.version = '0.2.0-dev'
   and not exists (select 1 from rulesets x where x.is_active);
```

> **Conséquence de production, identique à celle de §9.3** : tant que la migration d'activation juridique n'a pas publié un texte validé de `third_party_data_import`, la route de connexion Strava répond `503 CONSENT_DOCUMENT_UNAVAILABLE` en production. L'AC9 est préservée : le coach IA continue de fonctionner intégralement, seule la connexion d'une source est indisponible.

### 10.9 Ce que l'US-02 ne change pas

- Aucune table F1 n'est renommée, aucune colonne supprimée, aucune policy F1 retirée.
- `planned_sessions`, `plan_weeks`, `plan_blocks` : **inchangées** (le prévu n'est pas concerné).
- `session_logs.source` reste `declared` par défaut et **n'est jamais réécrit** — la « recatégorisation » de l'AC10 est une règle de lecture, pas une migration de données (ADR-015 §3).
- Le score hybride n'écrit dans aucune table du moteur de plan et n'est lu par aucune règle (ADR-014 §6).

---

## 11. US-03 — Placement horaire et imprévus

> Ajouté le **2026-08-12** par `architect`. Décisions : **ADR-016** (placement dérivé, imprévu = indisponibilité datée, granularité horaire), **ADR-017** (clôture d'imprévu → `session_log` `not_done`).
>
> Delta **additif** : deux migrations (`0019`, `0020`), aucune réécriture des migrations F1/F2. Deux nouvelles tables, quatre enums, deux fonctions, deux triggers. **43 tables après l'US-03.**
>
> **Amendement du 2026-08-12 (ADR-017 §8-§9)** : `schedule_incidents` gagne `acknowledged_at`, une contrainte, une policy `UPDATE` restreinte à cette seule colonne et deux index (§11.8). Toujours 43 tables, et **toujours aucune colonne ajoutée à `session_logs`**.
>
> **Aucune table de la F1 ni de l'US-02 n'est modifiée.** Pas une colonne ajoutée à `planned_sessions`, pas une à `session_logs`. C'est la conséquence directe d'ADR-016 §1 (le placement ne peut pas vivre dans une table écrite par `materializePlanVersion()` et figée par un snapshot immuable) et d'ADR-017 §4 (le lien vers le réalisé est porté du côté F3).

### 11.1 Enums (migration `0019`)

```sql
-- supabase/migrations/0019_session_placements.sql — ADR-016, ADR-017

create type placement_status          as enum ('scheduled','moved','cancelled_week');
create type placement_reason          as enum ('initial','plan_regenerated','availability_changed',
                                               'incident_reported','no_slot_available');
create type incident_resolution       as enum ('rescheduled','cancelled_week');
create type incident_closeout_outcome as enum ('log_created','already_logged',
                                               'skipped_no_consent','skipped_session_absent');
```

### 11.2 Journal des imprévus (`schedule_incidents`)

Un imprévu est une **indisponibilité datée** — une exception ponctuelle à la disponibilité récurrente de `availability_slots` — et non un attribut de séance (ADR-016 §3). C'est ce qui lui permet de survivre aux 2 à 5 régénérations de plan hebdomadaires (ADR-005) : une séance replacée mardi n'est pas perdue par une régénération de mercredi.

```sql
create table schedule_incidents (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  reported_at           timestamptz not null default now(),
  reported_for_date     date not null,                 -- date locale du créneau devenu indisponible
  blocked_slot          day_slot not null,             -- créneau macro concerné
  blocked_from          time not null,                 -- fenêtre neutralisée = fenêtre occupée
  blocked_to            time not null,                 --   ± planning.incident_block_margin_min
  scope                 text not null default 'session_slot'
                          check (scope in ('session_slot')),   -- extensible (journée entière un jour)
  -- Informatifs : ils meurent avec la version de plan, l'imprévu lui survit (ADR-016 §3).
  planned_session_id       uuid references planned_sessions(id) on delete set null,
  invalidated_placement_id uuid,                       -- FK ajoutée en 11.3, après session_placements
  resolution            incident_resolution not null,  -- verdict du SERVEUR, jamais du client
  -- Clôture (ADR-017) — renseignée par le job `schedule_closeout`, jamais à la création.
  closeout_outcome         incident_closeout_outcome,
  -- Ce lien de retour est AUSSI le discriminant « not_done automatique vs déclaré » attendu par
  -- `D-notdone-notice` (design §3.1) : il n'est renseigné que sur l'issue `log_created`, laquelle
  -- n'est atteinte qu'en l'ABSENCE de log de l'utilisateur à cette date. ADR-017 §8, §11.8.
  resulting_session_log_id uuid references session_logs(id) on delete set null,
  closed_out_at            timestamptz,
  -- Accusé de réception de l'utilisateur (« C'est exact »). GESTE UTILISATEUR, contrairement aux
  -- trois colonnes ci-dessus : seule colonne de la table ouverte à l'écriture client, par GRANT
  -- colonne. N'écrit RIEN dans `session_logs` — le `not_done` reste compté. ADR-017 §9.
  acknowledged_at          timestamptz,
  created_at            timestamptz not null default now(),

  constraint schedule_incidents_window_ordered check (blocked_from < blocked_to),
  constraint schedule_incidents_closeout_coherent
    check ((closed_out_at is null) = (closeout_outcome is null)),
  -- Un log de clôture n'existe que dans l'issue qui en produit un (ADR-017 §3).
  constraint schedule_incidents_log_requires_outcome
    check (resulting_session_log_id is null or closeout_outcome = 'log_created'),
  -- On n'acquitte que ce qui a été dit. Ferme le seul détournement possible du GRANT colonne :
  -- marquer un imprévu qui n'a produit aucun log n'a pas de sens (ADR-017 §9).
  constraint schedule_incidents_ack_requires_created_log
    check (acknowledged_at is null or closeout_outcome = 'log_created')
);
alter table schedule_incidents enable row level security;
create policy "schedule_incidents_select_own" on schedule_incidents for select to authenticated
  using (user_id = (select auth.uid()));
-- Aucune policy d'INSERT ni de DELETE. L'utilisateur SIGNALE (un bouton), il ne FABRIQUE pas un
-- imprévu résolu : `resolution` est le verdict de l'algorithme de placement, `closeout_outcome` /
-- `closed_out_at` / `resulting_session_log_id` ceux du job de clôture. Même patron que `consents`
-- (ADR-012 §1) et `data_connections` (§10.3) : écriture par une route serveur en `service_role`.
revoke insert, delete on schedule_incidents from authenticated;

-- UNE exception, et une seule : l'accusé de réception (ADR-017 §9). Acquitter est un GESTE
-- UTILISATEUR, pas un verdict serveur — exactement la distinction que `plan_diffs` (`items` vs
-- `acknowledged_at`) et `objectives` (`feasibility` vs `label`) traitent déjà ainsi (ADR-012 §3).
-- La policy ouvre l'UPDATE sur ses propres lignes ; c'est le GRANT COLONNE, et lui seul, qui
-- interdit de réécrire `resolution` ou `closeout_outcome` (`permission denied for column`).
create policy "schedule_incidents_ack_own" on schedule_incidents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on schedule_incidents from authenticated;
grant update (acknowledged_at) on schedule_incidents to authenticated;

create index schedule_incidents_window on schedule_incidents (user_id, reported_for_date);
create index schedule_incidents_open   on schedule_incidents (user_id, reported_for_date)
  where closed_out_at is null;
-- Sert le comptage de la question ouverte « fréquence/limite du signalement » (fiche §7), sans
-- rien préjuger de la règle qui sera retenue.
create index schedule_incidents_recent on schedule_incidents (user_id, reported_at desc);

-- ADR-017 §8 — un `session_log` est le produit de clôture d'AU PLUS un imprévu. Sans cet index
-- unique, « ce log est-il automatique ? » serait une question à réponse multiple.
create unique index schedule_incidents_resulting_log
  on schedule_incidents (resulting_session_log_id) where resulting_session_log_id is not null;

-- ADR-017 §9 — sert la lecture de `D-notdone-notice` en un seul parcours : imprévus clos ayant
-- produit un log, non encore acquittés, les plus récents d'abord.
create index schedule_incidents_notdone_notice
  on schedule_incidents (user_id, closed_out_at desc)
  where closeout_outcome = 'log_created' and acknowledged_at is null;
```

### 11.3 Placement des séances (`session_placements`)

Projection **dérivée** de `(planned_sessions, availability_slots, schedule_incidents, ruleset.params.planning)`, matérialisée pour être stable dans le temps (ADR-016 §1 — même argument qu'ADR-005 §4 contre le diff calculé à la volée). Append-only, avec chaîne de supersession : une seule ligne courante par séance prévue.

```sql
create table session_placements (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  planned_session_id  uuid not null references planned_sessions(id) on delete cascade,
  plan_version_id     uuid not null references plan_versions(id) on delete cascade,
  week_start          date not null,                 -- lundi ISO, fuseau de l'utilisateur
  status              placement_status not null,
  -- Date EFFECTIVE (AC2 : « seuls la date effective et l'horaire sont du ressort de F3 »).
  -- Peut différer de `planned_sessions.scheduled_date`, qui reste l'INTENTION du moteur.
  scheduled_date      date,
  scheduled_time      time,                          -- heure locale ; grille de 30 min (ADR-016 §4)
  slot                day_slot not null default 'unspecified',
  -- Le « avant » du motif `ancien → nouveau` du design §1.5. Ancré sur l'intention du MOTEUR et
  -- non sur la ligne précédente : c'est ce qui fait survivre le badge « DÉPLACÉE » à une
  -- régénération de plan (ADR-016 §1).
  origin_date         date not null,
  origin_time         time,                          -- null = la séance n'avait jamais été placée
  reason              placement_reason not null,
  incident_id         uuid references schedule_incidents(id) on delete set null,
  previous_placement_id uuid references session_placements(id) on delete set null,  -- chaîne d'audit
  ruleset_version     text not null references rulesets(version),
  guardrails_checked  text[] not null default '{}',  -- ids de règles évaluées (ADR-016 §6)
  superseded_at       timestamptz,
  superseded_by_placement_id uuid references session_placements(id) on delete set null,
  created_at          timestamptz not null default now(),

  -- AC4 : une séance annulée pour la semaine n'a ni date ni heure — et réciproquement.
  constraint session_placements_cancelled_has_no_schedule
    check ((status = 'cancelled_week') = (scheduled_date is null and scheduled_time is null)),
  -- Un placement non annulé porte TOUJOURS une heure : c'est l'objet même de la F3.
  constraint session_placements_scheduled_has_time
    check (status = 'cancelled_week' or scheduled_time is not null),
  -- 'moved' n'est pas décoratif : il implique un écart réel avec l'intention du moteur.
  constraint session_placements_moved_differs_from_origin
    check (status <> 'moved'
           or scheduled_date is distinct from origin_date
           or scheduled_time is distinct from origin_time),
  -- À sens unique (`0028_session_placements_supersede_two_phase.sql`) : un successeur connu exige
  -- un horodatage, mais un horodatage n'exige plus IMMÉDIATEMENT un successeur connu — nécessaire à
  -- l'écriture en DEUX temps de `materializeSessionPlacements()` (superséder avant d'insérer, pour
  -- l'index unique partiel `session_placements_current` ; rattacher le successeur seulement après,
  -- pour la FK `superseded_by_placement_id`). L'inverse (successeur sans horodatage) reste interdit.
  constraint session_placements_supersede_coherent
    check (superseded_by_placement_id is null or superseded_at is not null),
  constraint session_placements_incident_requires_reason
    check (incident_id is null or reason in ('incident_reported','no_slot_available'))
);
alter table session_placements enable row level security;
create policy "session_placements_select_own" on session_placements for select to authenticated
  using (user_id = (select auth.uid()));
-- Aucune policy d'écriture : produit par le serveur (`materializeSessionPlacements()`, chemin
-- UNIQUE — ADR-016 §2), au même titre que `planned_sessions`. Le `revoke` double l'absence de
-- policy, comme sur `data_connections` (§10.3).
revoke insert, delete on session_placements from authenticated;

-- FK manquante de 11.2 : les deux tables se référencent mutuellement, les deux colonnes sont
-- nullables, aucune contrainte différée n'est nécessaire.
alter table schedule_incidents
  add constraint schedule_incidents_invalidated_placement_fk
  foreign key (invalidated_placement_id) references session_placements(id) on delete set null;

-- Garde-fou anti double-appui : un placement donné ne peut être invalidé qu'une fois. Sans lui,
-- deux clics rapides sur « Signaler un imprévu » bloqueraient deux créneaux.
create unique index schedule_incidents_one_per_placement
  on schedule_incidents (invalidated_placement_id) where invalidated_placement_id is not null;

-- UNE seule ligne courante par séance prévue. C'est cette contrainte, et non du code applicatif,
-- qui interdit deux placements concurrents pour la même séance.
create unique index session_placements_current
  on session_placements (planned_session_id) where superseded_at is null;

create index session_placements_week
  on session_placements (user_id, week_start, scheduled_date) where superseded_at is null;
create index session_placements_day
  on session_placements (user_id, scheduled_date, scheduled_time)
  where superseded_at is null and status <> 'cancelled_week';
create index session_placements_incident
  on session_placements (incident_id) where incident_id is not null and superseded_at is null;
```

**Immuabilité partielle.** `forbid_mutation()` (§0.3) est inapplicable ici : la supersession *est* un `UPDATE`. Un trigger dédié restreint donc l'`UPDATE` aux deux seules colonnes de supersession — y compris pour le `service_role`, seul rôle qui écrit cette table.

```sql
create or replace function public.session_placements_supersede_only() returns trigger
language plpgsql as $$
begin
  if new.id                    is distinct from old.id
  or new.user_id               is distinct from old.user_id
  or new.planned_session_id    is distinct from old.planned_session_id
  or new.plan_version_id       is distinct from old.plan_version_id
  or new.week_start            is distinct from old.week_start
  or new.status                is distinct from old.status
  or new.scheduled_date        is distinct from old.scheduled_date
  or new.scheduled_time        is distinct from old.scheduled_time
  or new.slot                  is distinct from old.slot
  or new.origin_date           is distinct from old.origin_date
  or new.origin_time           is distinct from old.origin_time
  or new.reason                is distinct from old.reason
  or new.incident_id           is distinct from old.incident_id
  or new.previous_placement_id is distinct from old.previous_placement_id
  or new.ruleset_version       is distinct from old.ruleset_version
  or new.guardrails_checked    is distinct from old.guardrails_checked
  or new.created_at            is distinct from old.created_at
  then
    raise exception 'session_placements is append-only: only supersession columns may change'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger session_placements_append_only before update on session_placements
  for each row execute function session_placements_supersede_only();
```

> **Le `DELETE` reste volontairement ouvert au `service_role`.** Un trigger `BEFORE DELETE` bloquerait les cascades depuis `auth.users` (donc `erase_account()`, ADR-010 §8) et depuis `plan_versions`. Le placement n'est pas un artefact d'audit au sens d'ADR-006 : il n'a pas à survivre à la version de plan qu'il place.

### 11.4 Recalcul sur modification des disponibilités (AC2)

L'AC2 exige qu'une modification des disponibilités récurrentes recalcule le placement de la semaine en cours. Or `availability_slots` porte une policy `for all` et un `grant update` **table entière** (§2) : le client l'écrit directement par PostgREST, sans passer par aucune route serveur. Aucun crochet applicatif ne peut donc être garanti — **seul un trigger de base couvre tous les chemins d'écriture**, y compris ceux qui n'existent pas encore (l'écran de gestion des disponibilités est hors périmètre US-03, fiche §4).

```sql
create or replace function public.enqueue_placement_refresh() returns trigger
language plpgsql
security definer                      -- `job_queue` a RLS sans policy : inaccessible à `authenticated`
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  insert into job_queue (kind, user_id, idempotency_key, payload, scheduled_for)
  values ('refresh_placements', v_user,
          'refresh_placements:' || v_user || ':' ||
            to_char(date_trunc('minute', now() at time zone 'utc'), 'YYYYMMDDHH24MI'),
          '{}'::jsonb, now())
  on conflict (idempotency_key) do nothing;
  return coalesce(new, old);
end $$;
revoke all on function public.enqueue_placement_refresh() from public, anon, authenticated;

create trigger availability_slots_refresh_placements
  after insert or update or delete on availability_slots
  for each row execute function enqueue_placement_refresh();
```

La clé d'idempotence est tronquée **à la minute** : l'enregistrement d'un formulaire qui réécrit 14 lignes de créneaux produit **un** job, tandis qu'une modification faite plus tard dans la journée en produit bien un nouveau (une clé à la journée avalerait silencieusement la seconde modification). Latence de prise en compte : ≤ 5 min, cadence de `drain-jobs` (ADR-011).

### 11.5 Paramètres de placement — ruleset `0.3.0-dev` (migration `0020`)

`rulesets` est immuable (ADR-007 §1) : la F3 **publie une nouvelle version** qui reprend intégralement `0.2.0-dev` (US-02, section `hybrid_score`) et y ajoute une section `planning`. `0.1.0-dev` et `0.2.0-dev` ne sont ni modifiées ni supprimées.

```jsonc
"planning": {
  "slot_windows": {                                  // aucune heure n'existe dans availability_slots
    "am":          { "start": "06:30", "end": "11:30" },
    "pm":          { "start": "16:30", "end": "21:30" },
    "unspecified": { "start": "06:30", "end": "21:30" }
  },
  "grid_minutes": 30,                                // ADR-016 §4 — sous-créneaux fixes
  "preferred_start_times": {                         // lisibilité : 07h00 plutôt que 06h30 partout
    "am":          ["07:00", "06:30", "08:00", "09:00"],
    "pm":          ["18:30", "19:00", "17:30", "20:00"],
    "unspecified": ["18:30", "07:00", "12:30"]
  },
  "default_slot_capacity_min":            120,       // si availability_slots.max_minutes est null
  "min_lead_time_min":                     60,       // jamais un replacement « dans 10 minutes »
  "min_minutes_between_sessions_same_day": 360,      // à confirmer (ADR-016, question ouverte 1)
  "max_sessions_per_day":                   2,       // à confirmer
  "allow_two_intense_sessions_same_day": false,      // à confirmer
  "incident_block_margin_min":            120,       // largeur de la fenêtre neutralisée (ADR-016 §3)
  "reschedule_scope":          "current_week",       // corollaire d'AC4 : jamais de report cumulatif
  "closeout_local_hour":                    3,       // ADR-017 §1 — fenêtre de grâce
  "incident_soft_limit_per_week":        null        // QUESTION PRODUIT OUVERTE — voir ci-dessous
}
```

> ⚠️ **`incident_soft_limit_per_week: null` n'est pas un `null` bloquant.** Les `null` d'ADR-007 §4 vivent dans `params.guardrails` et **empêchent la publication d'un ruleset `1.0.0`**. Celui-ci est dans `params.planning`, et sa sémantique est *« aucune limite appliquée »* — l'état par défaut tant que le fondateur n'a pas tranché la question ouverte §7 de la fiche. `RulesetParamsSchema` doit le typer `number | null` **sans** le rendre requis, faute de quoi la F3 bloquerait la mise en production sur une question qu'elle a explicitement choisi de ne pas trancher.

`supabase/seed.sql` — l'**activation**, hors production, avec la même clause défensive qu'en §9.3 :

```sql
update rulesets r set is_active = true
 where r.version = '0.3.0-dev'
   and not exists (select 1 from rulesets x where x.is_active);
```

`docs/rulesets/0.3.0-dev.md` documente les 13 paramètres et leur justification, pendant de `0.1.0-dev.md` et `0.2.0-dev.md`.

### 11.6 Nouveaux `kind` de `job_queue`

Aucune infrastructure nouvelle (ADR-011). Deux `kind` s'ajoutent aux 2 de la F1 et aux 3 de l'US-02 :

| `kind` | Clé d'idempotence | Enrôlé par |
|---|---|---|
| `refresh_placements` | `refresh_placements:{user}:{YYYYMMDDHHMM}` | trigger `availability_slots_refresh_placements` (§11.4) |
| `schedule_closeout` | `schedule_closeout:{user}:{date locale J-1}` | cron horaire `/cron/enqueue-schedule-closeouts` (ADR-017 §1) |

### 11.7 Ce que l'US-03 ne change pas

- **`planned_sessions` : inchangée.** Ni `scheduled_time`, ni `moved_from`, ni `cancelled` — le placement vit dans sa propre table (ADR-016 §1). Le chemin d'écriture unique d'ADR-004 §2 et le test de cohérence snapshot ↔ projection restent valides tels quels.
- **`session_logs` : inchangée**, y compris après l'amendement du 2026-08-12. Le lien vers le log de clôture est porté par `schedule_incidents.resulting_session_log_id` (ADR-017 §4) — c'est lui, et non une colonne d'origine, qui distingue un `not_done` automatique d'un `not_done` déclaré (ADR-017 §8, §11.8). L'acquittement vit lui aussi côté F3 (`schedule_incidents.acknowledged_at`, ADR-017 §9). Aucun `alter table`, donc aucun impact sur les GRANT colonne de l'US-02 (ADR-015 §4), ni sur les tests d'inventaire T13 / T19.
- **`availability_slots` : inchangée en structure.** Seul un trigger `after` lui est attaché (§11.4) ; ses policies, ses GRANT et ses colonnes restent ceux de la F1.
- **`rulesets` : `0.2.0-dev` n'est pas modifiée** — `0.3.0-dev` la reprend (ADR-007 §1).
- Aucune table de l'US-02 (`data_connections`, `sync_runs`, `hybrid_scores`, …) n'est lue ni écrite par la F3.

### 11.8 Restitution et acquittement du `not_done` automatique (amendement ADR-017 §8-§9)

> Ajouté le **2026-08-12**, en réponse à `11-design-notes.md` §3 (carte `D-notdone-notice`) et §8
> (points 1 et 2). Deux besoins, **aucune table nouvelle**, **aucune colonne sur `session_logs`**.

**Le discriminant « automatique vs déclaré » existait déjà.** Un `session_log` `not_done` est le
produit de la clôture d'imprévu **si et seulement si** un `schedule_incidents` le référence :

```sql
-- Prédicat canonique (ADR-017 §8). À n'écrire qu'ici et dans le lecteur serveur.
exists (select 1 from schedule_incidents i where i.resulting_session_log_id = l.id)
```

Trois garanties de schéma le rendent exact, et non approximatif :

| Garantie | Portée |
|---|---|
| `schedule_incidents_log_requires_outcome` (§11.2) | Le lien n'est renseigné que sur `closeout_outcome = 'log_created'` |
| ADR-017 §3, issue `already_logged` | L'issue qui rencontre une saisie utilisateur **n'écrit rien** : le job ne peut lier que le log qu'il vient d'insérer |
| `schedule_incidents_resulting_log` (index unique partiel, §11.2) | Un log est le produit d'**au plus un** imprévu : la réponse est unique |

À quoi s'ajoute une garantie de cycle de vie : `session_logs` n'a **aucune policy `DELETE`**
(ADR-004 §1), donc le lien ne peut pas se nullifier dans le dos de la lecture ; le
`on delete set null` de la FK n'est exercé que par la cascade d'effacement de compte (ADR-010 §8),
qui emporte l'imprévu avec le log.

**L'acquittement est porté par `schedule_incidents.acknowledged_at`**, pas par `session_logs` : ce
qui est acquitté est la *déduction du coach*, pas le fait. Trois conséquences concrètes — (a) aucune
colonne n'est ajoutée à une table de santé ; (b) acquitter ne dépend **pas** du consentement
`health_data_processing`, contrairement à toute écriture sur `session_logs` (ADR-010 §2) ;
(c) l'acquittement **n'écrit rien dans le réalisé** : le `not_done` reste compté par
`buildPlanningContext().history`, la révision hebdomadaire (AC5) et `evaluateStagnation()` (AC6).

**Lecture canonique de `D-notdone-notice`** (Dashboard, fenêtre de 48 h, design §3.1) :

```sql
select i.id                as incident_id,
       i.resolution,                       -- pilote la 2e phrase du corps (design §3.1)
       i.reported_for_date,
       i.closed_out_at,
       l.id                as session_log_id,
       l.logged_date,
       ps.session_type, ps.duration_min    -- libellé « Seuil — 3 × 8 min » ; null si séance disparue
  from schedule_incidents i
  join session_logs l           on l.id  = i.resulting_session_log_id
  left join planned_sessions ps on ps.id = l.planned_session_id
 where i.user_id          = $1
   and i.closeout_outcome = 'log_created'
   and i.acknowledged_at is null
   and i.closed_out_at   >= now() - interval '48 hours'
   and l.completion       = 'not_done'     -- corriger la séance suffit à retirer la carte…
   and l.excluded_at     is null           -- …et une fusion Strava (ADR-015 §2) aussi
 order by i.closed_out_at desc;
```

Deux propriétés à ne pas perdre en implémentant :

- **La correction ne demande aucune écriture de plus.** `PATCH /session-logs/:id` faisant passer
  `completion` à `done`/`partial` sort la ligne de la jointure : il n'existe aucun état à
  resynchroniser entre `session_logs` et `schedule_incidents`, donc aucune incohérence possible.
- **La fenêtre de 48 h est une constante de présentation, pas un paramètre de ruleset.**
  `rulesets.params` porte les paramètres du **moteur** (ADR-007 §1) ; y loger une durée d'affichage
  imposerait de publier un `0.4.0-dev` pour un réglage d'UI. Elle vit dans le module de lecture
  (`NOT_DONE_NOTICE_WINDOW_HOURS = 48`), documentée là.

**Ce que l'amendement ne change pas** : `session_logs` (aucun `alter table`), `session_placements`,
les quatre issues de clôture d'ADR-017 §3, le contenu du log écrit (§4), et le fait que seuls les
imprévus **signalés** sont clôturés (§6).

---

## Tests attendus sur le schéma

À la charge de `tester` (intégration, base réelle). Au-delà des tests existants (isolation A/B, couverture RLS, immuabilité) :

| # | Test | Attendu |
|---|---|---|
| T1 | `erase_account()` sur un compte complet | `auth.users` vidé, 0 ligne résiduelle dans chaque table portant `user_id`, **hors `consents`** |
| T2 | `erase_account()` et registre de consentement | Lignes `consents` conservées, `subject_erased_at` renseigné, `ip_hash` et `user_agent` à `null`, `document_code`/`version`/`granted_at` intacts |
| T3 | `erase_account()` appelée par `authenticated` / `anon` | `permission denied` (le `revoke` sur la fonction), avant même le contrôle interne |
| T4 | `authenticated` tente `set_config('app.erasure_user_id', ...)` puis UPDATE/DELETE sur `consents` / `decision_traces` / `plan_versions` | Rejeté : `pg_has_role(current_user,'service_role','member')` est faux. Vérifier aussi qu'aucune RPC PostgREST n'expose `set_config` |
| T5 | `service_role` hors contexte d'effacement | UPDATE/DELETE sur les tables immuables toujours rejetés |
| T6 | Contexte d'effacement de l'utilisateur A, mutation d'une ligne de B | Rejetée (le GUC porte l'`user_id`, pas un booléen global) |
| T7 | INSERT `consents` par `authenticated` | Rejeté (aucune policy INSERT) |
| T8 | INSERT `consents` (service_role) avec un `(code, version, locale)` inexistant | Rejeté par la FK composite |
| T9 | UPDATE `athlete_profiles` / `session_logs` / `nutrition_checkins` après retrait du consentement santé | Rejeté par le `with check` |
| T10 | `authenticated` tente `update plan_diffs set items = ...` / `update notifications set title = ...` | `permission denied for column` |
| T11 | Acquittement légitime : `update plan_diffs set acknowledged_at = now()` / `notifications set read_at = now()` | Accepté sur ses propres lignes, refusé sur celles d'un tiers |
| T12 | `authenticated` tente `update objectives set feasibility = 'realistic'` | `permission denied for column` |
| T13 | Inventaire des privilèges | Requête sur `information_schema.column_privileges` : aucune colonne hors liste blanche n'accorde `UPDATE` à `authenticated` |
| T14 | Après `supabase db reset` **local** : état de `consent_documents` | Exactement **une** ligne `is_current = true` par `(code, locale)` pour les 4 codes ⇒ l'onboarding est jouable en local et en preview (§9.3) |
| T15 | Migrations seules, **sans** `seed.sql` (simulation de production) | **Zéro** ligne `is_current = true` dans `consent_documents` et **zéro** ligne `is_active = true` dans `rulesets` — le texte juridique provisoire et le ruleset `0.x` ne peuvent pas atteindre la production (findings B1 / B3) |
| T16 | Idempotence de l'activation par seed | Rejouer `seed.sql` sur une base où une version validée est déjà `is_current` **ne** bascule **pas** `1.0.0` : aucune violation de `consent_documents_current` ni de `rulesets_single_active` (§9.3) |
| **T17** | `authenticated` tente `insert into session_logs (…, source) values (…, 'connected')` | `permission denied for column source` (ADR-015 §4) |
| **T18** | `authenticated` tente `insert into session_logs (…, load_units) values (…, 99999)` | `permission denied for column load_units` — un client ne fabrique pas sa charge réalisée |
| **T19** | Inventaire des privilèges `INSERT` | Aucune colonne hors liste blanche n'accorde `INSERT` à `authenticated` sur `session_logs` / `body_metrics` (pendant de T13) |
| **T20** | `service_role` insère `source = 'connected'` sans consentement `third_party_data_import` | Rejeté par `enforce_connected_source_consents()` — **y compris en `service_role`** |
| **T21** | Idem sans consentement `health_data_processing` | Rejeté également : les deux consentements sont cumulatifs |
| **T22** | `authenticated` tente de lire `data_connection_secrets` | 0 ligne **et** `permission denied` selon le verbe — aucune policy, `revoke all` explicite |
| **T23** | `authenticated` tente `insert`/`update`/`delete` sur `data_connections` | Refusé : aucune policy d'écriture, `revoke insert, delete` |
| **T24** | Deux connexions vivantes pour le même `(user_id, provider_code)` | Rejeté par `data_connections_one_live_per_provider` ; une connexion `revoked` n'empêche pas une reconnexion |
| **T25** | Deux utilisateurs connectent le même `external_account_id` Strava | Rejeté par `data_connections_external_account` |
| **T26** | Import du même `external_activity_id` deux fois (webhook rejoué) | Une seule ligne `session_logs` — `session_logs_external_activity` |
| **T27** | `claim_connection_refresh()` appelée deux fois de suite | `true` puis `false` tant que le bail court ; `permission denied` pour `authenticated` |
| **T28** | Une séance fusionnée (`excluded_at` renseigné) | N'apparaît **dans aucun** agrégat : `session_logs_counted`, score hybride, Dashboard, `PlanningContext.history` — AC5 |
| **T29** | `hybrid_scores` avec `status = 'calibration'` et `score` non nul | Rejeté par `hybrid_scores_calibration_has_no_score` — AC8 |
| **T30** | `erase_account()` sur un compte connecté | 0 ligne résiduelle dans `data_connections`, `data_connection_secrets`, `sync_runs`, `hybrid_scores` (cascades depuis `auth.users`) |
| **T31** | Couverture RLS après US-02 | Les 7 nouvelles tables ont RLS activée ; `session_logs_counted` est une **vue** (`security_invoker`), donc hors périmètre du test de couverture des tables — à ne pas signaler comme un manquement |
| **T32** | `authenticated` tente `insert`/`update`/`delete` sur `session_placements` | Refusé : aucune policy d'écriture, `revoke insert, delete`. Un utilisateur ne se replace pas lui-même une séance |
| **T33** | `authenticated` tente `insert into schedule_incidents (…, resolution) values (…)` | Refusé : `resolution` est le verdict du serveur, pas une donnée de saisie (patron `consents`, ADR-012 §1) |
| **T34** | `service_role` tente `update session_placements set scheduled_time = …` | Rejeté par `session_placements_supersede_only()` — **y compris en `service_role`** : un replacement est une nouvelle ligne, jamais une réécriture |
| **T35** | `service_role` renseigne `superseded_by_placement_id` sans `superseded_at` | Rejeté par `session_placements_supersede_coherent` ; l'inverse (`superseded_at` seul, en attendant l'insertion de la ligne remplaçante) est en revanche ACCEPTÉ depuis `0028` — c'est la séquence réelle de `materializeSessionPlacements()` (superséder avant d'insérer, rattacher le successeur après) |
| **T36** | Deux placements courants pour la même `planned_session_id` | Rejeté par `session_placements_current` (index unique partiel) |
| **T37** | `status = 'cancelled_week'` avec une `scheduled_date` ou une `scheduled_time` | Rejeté par `session_placements_cancelled_has_no_schedule` — AC4 |
| **T38** | `status = 'moved'` avec `(scheduled_date, scheduled_time) = (origin_date, origin_time)` | Rejeté par `session_placements_moved_differs_from_origin` : le badge « DÉPLACÉE » ne peut pas mentir |
| **T39** | Deux `schedule_incidents` sur le même `invalidated_placement_id` (double appui) | Rejeté par `schedule_incidents_one_per_placement` — un seul créneau bloqué |
| **T40** | `update`/`insert`/`delete` sur `availability_slots` par le propriétaire | Accepté **et** exactement **une** ligne `job_queue` `refresh_placements` créée par minute, quel que soit le nombre de lignes touchées (§11.4) |
| **T41** | `erase_account()` sur un compte ayant signalé des imprévus | 0 ligne résiduelle dans `session_placements` et `schedule_incidents` (cascades depuis `auth.users`) ; le trigger append-only **ne bloque pas** la suppression |
| **T42** | Couverture RLS après US-03 | Les 2 nouvelles tables ont RLS activée avec une policy explicite ; `session_placements` ne porte **aucune** policy d'écriture, `schedule_incidents` en porte **une seule**, d'`UPDATE`, adossée à un GRANT d'une colonne unique (T44) |
| **T43** | `authenticated` tente `update schedule_incidents set resolution = …` / `closeout_outcome = …` / `resulting_session_log_id = …` / `closed_out_at = …` | `permission denied for column` — les verdicts serveur restent hors de portée malgré la nouvelle policy `UPDATE` (ADR-017 §9) |
| **T44** | Acquittement légitime : `update schedule_incidents set acknowledged_at = now()` | Accepté sur ses propres lignes, **0 ligne touchée** sur celles d'un tiers. Pendant exact de T11 (`plan_diffs`) |
| **T45** | `acknowledged_at` posé sur un imprévu dont `closeout_outcome` vaut `already_logged` / `skipped_no_consent` / `skipped_session_absent` / `null` | Rejeté par `schedule_incidents_ack_requires_created_log` : on n'acquitte que ce que le coach a effectivement écrit |
| **T46** | Deux `schedule_incidents` pointant le même `resulting_session_log_id` | Rejeté par `schedule_incidents_resulting_log` — le discriminant « automatique vs déclaré » (ADR-017 §8) n'a jamais deux réponses |
| **T47** | Un `session_log` `not_done` saisi par l'utilisateur (écran `MqvfH`), sans imprévu signalé | `exists (select 1 from schedule_incidents where resulting_session_log_id = l.id)` renvoie **faux** ⇒ `D-notdone-notice` n'est jamais rendue pour une saisie manuelle (design §3.1) |

---

## Journal des révisions

### 2026-08-12 — amendement US-03 (`architect`) : `not_done` automatique visible et acquittable

| # | Point | Décision |
|---|---|---|
| **R19** | `D-notdone-notice` (`11-design-notes.md` §3) ne doit s'afficher que pour un `not_done` créé par `closeOutScheduleIncidents()`, **jamais** pour un « Non » saisi par l'utilisateur sur `MqvfH`. Aucun champ ne portait explicitement cette distinction | **Aucune colonne nouvelle.** Le lien de retour `schedule_incidents.resulting_session_log_id` (ADR-017 §4) *est* le discriminant : la contrainte `schedule_incidents_log_requires_outcome` le réserve à l'issue `log_created`, et cette issue n'est atteinte qu'en l'absence de tout log de l'utilisateur à cette date (ADR-017 §3). Rendu non ambigu par un index unique partiel, et indexé pour la lecture. Écartés : une colonne `origin` sur `session_logs` (ouvrirait une surface de GRANT sur une table de santé pour une information déjà présente, et romprait ADR-017 §4 / §11.7) et une déduction depuis le texte de `not_done_reason` (texte libre réécrit par l'utilisateur via le GRANT de `0007`). ADR-017 §8, §11.8 |
| **R20** | L'action « C'est exact » doit ranger la carte **sans modifier la donnée métier** — ni re-déclaration, ni écriture de santé. `plan_diffs.acknowledged_at` fournissait le patron, restait à choisir le porteur et le régime d'écriture | `schedule_incidents.acknowledged_at` (et non `session_logs`) : c'est la **déduction du coach** que l'on acquitte, pas le fait ; l'écriture échappe ainsi au consentement santé exigé sur `session_logs` (ADR-010 §2), ce qu'un simple « noté » ne doit pas requérir. Régime d'écriture repris de `plan_diffs` : policy `UPDATE` sur ses propres lignes + **GRANT colonne** limité à `acknowledged_at`, `resolution` / `closeout_outcome` / `closed_out_at` / `resulting_session_log_id` restant en `permission denied for column` (ADR-012 §3). Contrainte `schedule_incidents_ack_requires_created_log`, route nominale `POST /schedule/incidents/:id/acknowledge`, tests T43-T47. ADR-017 §9, §11.8 |

### 2026-08-12 — extension US-03 (`architect`) : placement horaire et imprévus

| # | Point | Décision |
|---|---|---|
| **R14** | Où stocker l'heure précise ? `planned_sessions` est écrite par un chemin **unique** (`materializePlanVersion()`, ADR-004 §2), projetée depuis un `plan_versions.snapshot` **immuable**, et **rejetée à chaque régénération** (2 à 5 par semaine) | Table dédiée `session_placements`, append-only avec chaîne de supersession, dérivée de `(planned_sessions, availability_slots, schedule_incidents, ruleset)`. **Aucune colonne ajoutée à `planned_sessions`.** ADR-016 §1, §11.3 |
| **R15** | Un imprévu rattaché à une séance serait perdu à la première régénération de plan — potentiellement le lendemain du signalement | L'imprévu est modélisé comme une **indisponibilité datée** (`schedule_incidents`), fait utilisateur de la même famille que `availability_slots` : il survit à toutes les régénérations, et le placement recalculé évite naturellement le créneau signalé. ADR-016 §3, §11.2 |
| **R16** | Granularité horaire — question ouverte §7 de la fiche, déléguée à `architect`. `availability_slots` ne porte **aucune heure** (ni début, ni fin) | **Sous-créneaux fixes sur une grille de 30 min**, bornes et préférences dans `ruleset.params.planning`. Le minute-près serait une fausse précision. Stockage en `time` standard : changer de grille ne sera jamais une migration. ADR-016 §4, §11.5 |
| **R17** | L'AC2 (« recalcul si les disponibilités changent ») ne peut pas s'appuyer sur une route serveur : `availability_slots` est écrite **directement par le client** (policy `for all` + `grant update` table entière) | Trigger de base `availability_slots_refresh_placements` → `job_queue` (`security definer`, clé d'idempotence tronquée à la minute). Couvre tous les chemins d'écriture, y compris ceux qui n'existent pas encore. §11.4 |
| **R18** | La décision du fondateur (« un imprévu débouchant sur une séance non réalisée crée un `session_log` `not_done` ») exige une écriture de **données de santé** par le serveur — chemin qui **contourne RLS**, donc les policies de consentement d'ADR-010 §2 | Job de clôture quotidien (`schedule_closeout`, 03 h locale) avec 4 issues journalisées, dont `skipped_no_consent`. Le lien est porté par `schedule_incidents.resulting_session_log_id` : **aucune colonne ajoutée à `session_logs`**. ADR-017, §11.2 |

### 2026-08-12 — extension US-02 (`architect`) : centralisation des données et score hybride

| # | Point | Décision |
|---|---|---|
| **R8** | `session_logs` ne portait **aucune charge réalisée** (`actualLoadUnits` laissé à `null` en dur par `build-planning-context.ts`) : le score hybride de l'US-02 n'avait pas de matière première | Colonne `load_units` ajoutée au réalisé, calculée serveur par `computeLoadUnits()` via un chemin d'écriture unique, jamais fournie par le client. ADR-015 §1, §10.6 |
| **R9** | `session_logs.sport_id` existait mais n'était jamais écrit, et `CreateSessionLogInput` ne portait ni discipline ni type de séance : l'AC3 (« jamais bloqué faute d'intégration pour son sport ») n'était pas réellement couverte | Colonnes `session_type` et `started_at` ajoutées, schéma d'entrée étendu, point d'entrée « séance hors plan » à maquetter par `designer`. ADR-015 §5 |
| **R10** | `INSERT` accordé table entière alors que `source` (et désormais `load_units`) sont décidés par le serveur : un client pouvait s'auto-déclarer `connected` et fabriquer sa charge | `INSERT` révoqué puis ré-accordé **colonne par colonne** sur `session_logs` et `body_metrics` — amendement d'ADR-012 §3, qui n'avait traité que `UPDATE`. ADR-015 §4, tests T17-T19 |
| **R11** | Les policies RLS de consentement (ADR-010 §2) ne protègent pas les écritures `service_role`, qui contournent RLS — or tout l'import tiers passe par là | Trigger `enforce_connected_source_consents()` sur `session_logs` et `body_metrics` : toute ligne `source = 'connected'` exige `health_data_processing` **et** `third_party_data_import`, quel que soit le rôle. ADR-013 §5, tests T20-T21 |
| **R12** | Stockage des jetons OAuth | Table séparée `data_connection_secrets`, sans aucune policy, `revoke all` explicite, jetons chiffrés `pgcrypto`. Bail exclusif de rafraîchissement (`claim_connection_refresh`) imposé par la rotation immédiate des refresh tokens Strava. ADR-013 §2-§3 |
| **R13** | AC10 « recatégoriser les données d'une source déconnectée en historique déclaratif » | `session_logs.source` reste **immuable** ; la provenance affichée est dérivée (`connected` + connexion active ⇒ « synchronisé », sinon « déclaré »). Le résultat visible est celui demandé, sans falsifier le journal d'acquisition ni empêcher une reconnexion. ADR-015 §3 |

### 2026-08-10 — correctifs `developer` Lot L3 (bugs découverts en exécutant les tests E2E contre Supabase local)

| # | Point | Décision |
|---|---|---|
| **R6** | `decision_traces.scope_ref_id` typé `uuid` alors que `DecisionTrace.scopeRefId` (`@hybride/domain`, Lot L2) est un `string \| null` générique — certaines règles y placent un index de bloc sérialisé (`String(blockIndex)`, ex. `"0"`), pas un UUID (`packages/rules-engine/src/pipeline/04-build-macro-blocks.ts`, `06-compute-weekly-load-target.ts`). Le moteur pur (Lot L2) n'ayant jamais persisté ses traces en base avant le Lot L3 (`materializePlanVersion()`, premier chemin d'écriture réel), cette incompatibilité n'avait jamais été exercée : **toute** génération de plan comportant un bloc macro — donc tout run, AC1 — échouait à l'insertion (`invalid input syntax for type uuid: "0"`), détecté en exécutant `onboarding.spec.ts` (E2E) contre une base Supabase locale réelle | Colonne repassée en `text` (aucune contrainte de format perdue : ce n'était pas une vraie FK, seulement une clé de filtrage/traçabilité). Migration `0005_engine_audit.sql` corrigée directement (base encore vierge de données de production, même liberté que l'arbitrage du 2026-08-07 — `08-architecture.md` §9). `developer` signale ce correctif à `architect`/`code-reviewer` plutôt que de le documenter seulement en commentaire de migration : voir le rapport de fin de Lot L3 |
| **R7** | `onboarding_sessions` sans contrainte d'unicité sur « une session `in_progress` par utilisateur ». Deux `POST /api/v1/onboarding/session` concurrents (double montage d'effet React en développement, double onglet) créaient chacun une session : la conversation progressait dans l'une, mais la lecture « session courante » ailleurs (`ORDER BY started_at DESC LIMIT 1`, écrans disclaimer/consentement/récap) pouvait résoudre l'autre, restée vide — récap affichant un profil vide. Détecté en exécutant `onboarding-negotiation.spec.ts` (E2E) | Index unique partiel `onboarding_sessions_one_in_progress (user_id) where status = 'in_progress'` (migration `0004_onboarding.sql`). La route `POST /api/v1/onboarding/session` gère la violation d'unicité (`23505`) en ré-interrogeant la session déjà existante plutôt que d'échouer |

### 2026-08-09 — arbitrage `architect` post-second audit du Lot L1 (contradiction `is_current`)

| # | Point | Décision |
|---|---|---|
| **R5** | §9 exigeait `is_current = true` au seed (« PRÉREQUIS DUR », révision R2) ; l'implémentation pose `is_current = false` partout, y compris en local (correctif B3). Conséquence : `POST /api/v1/consents` ne peut résoudre aucune version courante ⇒ onboarding bloqué en permanence, même en développement | Le prérequis dur est **relatif à l'environnement**, pas uniforme : il porte sur *l'environnement où l'onboarding doit fonctionner*, pas sur la migration. **Hors production** (local + preview), `supabase/seed.sql` active `1.0.0`/`fr` pour les 4 documents ⇒ Lot L2 débloqué. **En production**, `is_current` reste `false` jusqu'à une migration dédiée publiant une version juridiquement validée ⇒ l'intention de B3 est préservée, `seed.sql` n'étant structurellement jamais appliqué à la production. Activation à écrire de façon **défensive** (`not exists … is_current`) pour ne pas heurter l'index unique partiel `consent_documents_current` le jour de la migration d'activation. Distinction FK composite / `is_current` explicitée. Détail : §9.3, ADR-010 §9 |
| **R5b** | Portée de `seed.sql` mal documentée | Vérification faite : Supabase applique `seed.sql` **aussi aux branches preview**, jamais à la production (seules les migrations y sont propagées). La garantie est « jamais en production », pas « jamais à distance ». Commentaires d'en-tête de `supabase/seed.sql` à corriger ; la garantie ADR-007 (aucun ruleset `0.x` actif en production) reste valide. §9 |
| **R5c** | Activation inconditionnelle dans `seed.sql` | `rulesets` : `update … set is_active = true` entrera en collision avec `rulesets_single_active` (index unique **global**) dès la publication d'un ruleset `1.0.0` actif. Même correctif défensif attendu que pour `consent_documents`. §9.3 |
| **R5d** | Blocage production non observable | `POST /api/v1/consents` et `.../disclaimer` doivent répondre `503 CONSENT_DOCUMENT_UNAVAILABLE` (et alerter) quand aucun document courant n'existe, plutôt que `500` ou une insertion arbitraire. Nouveaux tests T14 / T15 / T16 |

### 2026-08-07 — arbitrage `architect` post-revue du Lot L1 (4 points `code-reviewer`)

| # | Point | Décision |
|---|---|---|
| **R1** | `forbid_mutation()` fermait simultanément les deux voies d'effacement RGPD (cascade DELETE **et** anonymisation par UPDATE) | Le trigger admet **une** dérogation : le contexte d'effacement (`app.erasure_user_id` + rôle membre de `service_role`), ouvert uniquement par `erase_account()`. L'effacement est une **suppression réelle**, pas une anonymisation de traces. `consents` est le seul survivant, sous forme pseudonyme. FK `rulesets.published_by` et `plan_reviews.reviewer_id` passées en `on delete set null` (elles bloquaient la suppression d'un compte `staff`). ADR-010 §7-§8 |
| **R2** | `consents` sans FK vers `consent_documents` : consentement santé auto-délivrable | FK composite `(document_code, document_version, locale) → consent_documents(code, version, locale)` **et** suppression de la policy `consents_insert_own` : l'écriture devient exclusivement `service_role`, qui résout `is_current` et calcule `ip_hash`/`user_agent`. ADR-012 §1 |
| **R3** | Consentement santé vérifié à l'INSERT mais pas à l'UPDATE | `has_active_consent()` ajouté au `with check` des policies UPDATE de `athlete_profiles` et `session_logs`. Extension : `nutrition_checkins` (policy `for all` sans aucun contrôle) éclatée en `select`/`insert`/`update`, avec contrôle sur `insert` et `update`. ADR-012 §2 |
| **R4** | `plan_diffs` et `notifications` réécrivables intégralement | Inversion de la stratégie par défaut : `alter default privileges` n'accorde plus `UPDATE` à `authenticated`. UPDATE est accordé table par table, au niveau colonne quand c'est pertinent : `plan_diffs (acknowledged_at)`, `notifications (read_at)`, `objectives (label, target_date, target_metric, sport_id, kind)`, `session_logs` (hors `source`), `athlete_profiles` (hors `data_regime`), `profiles` (hors `role`), `nutrition_checkins`. `EXECUTE` sur les fonctions n'est plus accordé à `PUBLIC` par défaut. ADR-012 §3 |
