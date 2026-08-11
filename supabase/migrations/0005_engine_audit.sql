-- supabase/migrations/0005_engine_audit.sql
-- Source : docs/db-schema.md §4 (DDL canonique, arbitrage `architect` du 2026-08-07)

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
  is_hard_guardrail boolean not null default false,
  scope            text not null,        -- 'plan'|'block'|'week'|'session'|'nutrition_day'|'objective'|'pain_zone'
  -- `text`, PAS `uuid` (correction Lot L3, `developer`, 2026-08-10) : `DecisionTrace.scopeRefId`
  -- (@hybride/domain) est un `string | null` générique — tantôt un vrai UUID (`objective.id`),
  -- tantôt un index de bloc sérialisé (`String(blockIndex)`, ex. "0", "1"…), jamais garanti être un
  -- UUID. Le moteur (Lot L2) n'ayant jamais persisté ses traces avant ce lot, l'incompatibilité de
  -- type n'avait jamais été exercée : `materializePlanVersion()` échouait systématiquement dès la
  -- première génération de plan (`invalid input syntax for type uuid`) sur tout run comportant un
  -- bloc macro (donc TOUT run — étape 4 du pipeline, AC1). Voir `docs/db-schema.md` (même correction).
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
