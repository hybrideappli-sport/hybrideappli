-- supabase/migrations/0024_session_placements.sql — US-03, Lot L1, ADR-016, ADR-017 (amendée §8-§9)
-- Source : docs/db-schema.md §11.1-§11.4 (DDL canonique).
--
-- Renumérotée par `developer` : le plan `plans/US-03-planning-emploi-du-temps.md` et
-- `docs/db-schema.md` désignent cette migration `0019_session_placements.sql`, en supposant que
-- l'US-02 s'arrêtait à `0018`. Cinq migrations F2 (`0018_data_connections.sql` →
-- `0023_data_connection_secrets_functions.sql`) occupent en réalité ces numéros sur ce dépôt.
-- Migrations additives uniquement (règle non négociable du plan §3) : on ne renomme ni ne modifie
-- `0001` → `0023`, on poursuit la numérotation à `0024`. Signalé ici pour mise à jour de la
-- documentation par `architect`, même patron que la note de tête de `0018_data_connections.sql`.
--
-- Delta additif : quatre enums, deux tables (`schedule_incidents`, `session_placements`), une FK
-- croisée, deux fonctions/triggers. Aucune réécriture des migrations F1/F2. Aucune colonne ajoutée
-- à `planned_sessions`, `session_logs` ni `availability_slots` (ADR-016 §1, §11.7).
--
-- `schedule_incidents` est créée directement avec `acknowledged_at` et ses garde-fous : le texte de
-- `docs/db-schema.md` §11.2 présente déjà la table à l'état amendé (ADR-017 §8-§9, §11.8) — il n'y a
-- pas de migration séparée à écrire pour l'amendement, il est intégré dès la création.

-- 11.1 — Enums ----------------------------------------------------------------

create type placement_status          as enum ('scheduled','moved','cancelled_week');
create type placement_reason          as enum ('initial','plan_regenerated','availability_changed',
                                               'incident_reported','no_slot_available');
create type incident_resolution       as enum ('rescheduled','cancelled_week');
create type incident_closeout_outcome as enum ('log_created','already_logged',
                                               'skipped_no_consent','skipped_session_absent');

-- 11.2 — Journal des imprévus (`schedule_incidents`) ---------------------------
-- Un imprévu est une indisponibilité DATÉE — une exception ponctuelle à la disponibilité récurrente
-- de `availability_slots` — et non un attribut de séance (ADR-016 §3). C'est ce qui lui permet de
-- survivre aux 2 à 5 régénérations de plan hebdomadaires (ADR-005).

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
  invalidated_placement_id uuid,                       -- FK ajoutée plus bas, après session_placements
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

-- 11.3 — Placement des séances (`session_placements`) -------------------------
-- Projection DÉRIVÉE de `(planned_sessions, availability_slots, schedule_incidents,
-- ruleset.params.planning)`, matérialisée pour être stable dans le temps (ADR-016 §1 — même
-- argument qu'ADR-005 §4 contre le diff calculé à la volée). Append-only, avec chaîne de
-- supersession : une seule ligne courante par séance prévue.

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
  constraint session_placements_supersede_coherent
    check ((superseded_at is null) = (superseded_by_placement_id is null)),
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

-- Immuabilité partielle : `forbid_mutation()` (0001, §0.3) est inapplicable ici, la supersession
-- EST un `UPDATE`. Un trigger dédié restreint donc l'`UPDATE` aux deux seules colonnes de
-- supersession — y compris pour le `service_role`, seul rôle qui écrit cette table.

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

-- Le `DELETE` reste volontairement ouvert au `service_role`. Un trigger `BEFORE DELETE` bloquerait
-- les cascades depuis `auth.users` (donc `erase_account()`, ADR-010 §8) et depuis `plan_versions`.
-- Le placement n'est pas un artefact d'audit au sens d'ADR-006 : il n'a pas à survivre à la version
-- de plan qu'il place.

-- 11.4 — Recalcul sur modification des disponibilités (AC2) -------------------
-- L'AC2 exige qu'une modification des disponibilités récurrentes recalcule le placement de la
-- semaine en cours. Or `availability_slots` porte une policy `for all` et un `grant update` TABLE
-- ENTIÈRE (§2) : le client l'écrit directement par PostgREST, sans passer par aucune route serveur.
-- Aucun crochet applicatif ne peut donc être garanti — seul un trigger de base couvre tous les
-- chemins d'écriture, y compris ceux qui n'existent pas encore (l'écran de gestion des
-- disponibilités est hors périmètre US-03, fiche §4).

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
