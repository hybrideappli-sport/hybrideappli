-- supabase/migrations/0020_hybrid_scores.sql — US-02, Lot L1, ADR-014
-- Source : docs/db-schema.md §10.7 (désignée `0017` dans la documentation — voir la note de
-- renumérotation en tête de `0018_data_connections.sql`).

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
