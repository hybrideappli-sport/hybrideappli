-- supabase/migrations/0011_job_queue_claim.sql — Lot L5, ADR-011 §3.
--
-- `job_queue` existe déjà (`0009_ops.sql`), RLS activée, AUCUNE policy (service_role seul). Cette
-- migration n'ajoute AUCUNE table : elle ajoute les DEUX fonctions nécessaires au verrouillage
-- concurrent prescrit par ADR-011 §3 (« FOR UPDATE SKIP LOCKED »). Supabase-js/PostgREST n'exposent
-- aucun moyen d'exprimer `SELECT ... FOR UPDATE SKIP LOCKED` depuis le client applicatif (ce n'est
-- pas une requête `select`/`update` REST classique) : la seule voie est une fonction Postgres
-- dédiée, sur le même modèle que `has_active_consent()`/`is_staff()`/`erase_account()`
-- (`0001_extensions_enums_helpers.sql`, `0002_identity_consents.sql`) — `security definer`,
-- `EXECUTE` retiré de `PUBLIC` puis regrant explicite au seul rôle qui doit l'appeler.
--
-- Deux fonctions, appelées dans cet ordre par `POST /api/v1/cron/drain-jobs` :
--   1) `requeue_stuck_job_queue(p_stuck_after_seconds)` — reprise après panne (ADR-011 §3 : « un job
--      planté est repris après expiration du verrou »). Un job resté `running` avec un `locked_at`
--      plus vieux que le seuil est repassé `pending`, SANS réinitialiser `attempts` (le compteur de
--      tentatives doit survivre à la reprise pour que l'abandon après N tentatives reste correct).
--   2) `claim_job_queue(p_limit)` — verrouille et retourne un lot borné de jobs `pending` dont
--      `scheduled_for <= now()`, dans l'ordre d'échéance, en sautant les lignes déjà verrouillées
--      par une invocation concurrente (`SKIP LOCKED`) plutôt que d'attendre ou d'échouer. Chaque
--      ligne retournée est immédiatement marquée `running`/`locked_at = now()`/`attempts + 1` :
--      la lecture ET la réservation sont un seul aller-retour atomique, condition nécessaire à
--      l'absence de double-traitement (ADR-011 « Aucune double-génération de plan ni double-
--      notification, garanti par la base et non par la chance »).
create or replace function public.requeue_stuck_job_queue(p_stuck_after_seconds int default 900)
returns int
language sql
security definer
set search_path = public
as $$
  with requeued as (
    update job_queue
       set status = 'pending', locked_at = null
     where status = 'running'
       and locked_at is not null
       and locked_at < now() - make_interval(secs => p_stuck_after_seconds)
    returning id
  )
  select count(*)::int from requeued;
$$;
revoke all on function public.requeue_stuck_job_queue(int) from public, anon, authenticated;
grant execute on function public.requeue_stuck_job_queue(int) to service_role;

create or replace function public.claim_job_queue(p_limit int)
returns setof job_queue
language sql
security definer
set search_path = public
as $$
  update job_queue
     set status = 'running', locked_at = now(), attempts = attempts + 1
   where id in (
     select id from job_queue
      where status = 'pending'
        and scheduled_for <= now()
      order by scheduled_for
      for update skip locked
      limit p_limit
   )
  returning *;
$$;
revoke all on function public.claim_job_queue(int) from public, anon, authenticated;
grant execute on function public.claim_job_queue(int) to service_role;
