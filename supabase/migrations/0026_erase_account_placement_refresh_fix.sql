-- supabase/migrations/0026_erase_account_placement_refresh_fix.sql — US-02/US-03, correction
-- post-revue `code-reviewer` (finding B1, commits `58c61e2`/`aaba499`).
--
-- `erase_account()` (`0002_identity_consents.sql`) fait `delete from auth.users where id = p_user`,
-- qui cascade sur `availability_slots` (`on delete cascade`, `0006_availability.sql` — voir
-- `docs/db-schema.md` §? pour la table d'origine). Le trigger `availability_slots_refresh_placements`
-- (`0024_session_placements.sql:254-256`), déclenché `after ... delete`, appelle alors
-- `enqueue_placement_refresh()` qui tente d'insérer dans `job_queue` une ligne portant
-- `user_id = old.user_id` — un utilisateur déjà supprimé de `auth.users` à ce point de la
-- transaction. `job_queue_user_id_fkey` rejette l'insertion et `erase_account()` échoue en entier
-- (le droit à l'effacement, ADR-010 §8, est cassé pour tout utilisateur ayant des
-- `availability_slots` — donc la quasi-totalité des comptes ayant complété l'onboarding).
--
-- Correctif : même patron que `forbid_mutation()` (`0001_extensions_enums_helpers.sql:90-115`),
-- qui neutralise déjà un comportement par défaut sous le contexte d'effacement RGPD posé par
-- `erase_account()` via le GUC de session `app.erasure_user_id` (`set local`, portée transaction).
-- Ici on ne bloque rien (l'immuabilité n'est pas en jeu) : on se contente de ne PAS enrôler de job
-- de rafraîchissement de placements pour un utilisateur en cours d'effacement — un job de recalcul
-- serait de toute façon sans objet (le compte, ses `planned_sessions` et ses `session_placements`
-- disparaissent dans la même transaction).
--
-- Migration additive uniquement (règle non négociable, cf. tête de `0024_session_placements.sql`) :
-- `create or replace function`, pas de réécriture de `0024`.

create or replace function public.enqueue_placement_refresh() returns trigger
language plpgsql
security definer                      -- `job_queue` a RLS sans policy : inaccessible à `authenticated`
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_erasure_ctx text := nullif(current_setting('app.erasure_user_id', true), '');
begin
  -- Même garde que `forbid_mutation()` : GUC positionné sur cet utilisateur EXACT, ET rôle
  -- effectif membre de `service_role` (seul `erase_account()`, `security definer`, peut réunir
  -- les deux). Un `authenticated`/`anon` qui positionnerait le GUC de son propre chef ne franchit
  -- pas la seconde condition.
  if v_erasure_ctx is not null
     and v_erasure_ctx = v_user::text
     and pg_has_role(current_user, 'service_role', 'member')
  then
    return coalesce(new, old);
  end if;

  insert into job_queue (kind, user_id, idempotency_key, payload, scheduled_for)
  values ('refresh_placements', v_user,
          'refresh_placements:' || v_user || ':' ||
            to_char(date_trunc('minute', now() at time zone 'utc'), 'YYYYMMDDHH24MI'),
          '{}'::jsonb, now())
  on conflict (idempotency_key) do nothing;
  return coalesce(new, old);
end $$;
revoke all on function public.enqueue_placement_refresh() from public, anon, authenticated;
