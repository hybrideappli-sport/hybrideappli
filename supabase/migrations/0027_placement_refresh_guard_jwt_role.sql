-- supabase/migrations/0027_placement_refresh_guard_jwt_role.sql — US-02/US-03, correction
-- post-revue `code-reviewer` (finding N1, seconde passe).
--
-- `enqueue_placement_refresh()` (`0024_session_placements.sql`, corrigée en `0026`) est
-- `security definer`. Sous `security definer`, `current_user` vaut le PROPRIÉTAIRE de la
-- fonction pendant toute sa durée d'exécution — jamais l'appelant réel. Le garde posé en `0026` :
--
--   if v_erasure_ctx is not null and v_erasure_ctx = v_user::text
--      and pg_has_role(current_user, 'service_role', 'member')
--
-- est donc **inerte** : sa seconde condition est toujours vraie, quel que soit l'appelant réel —
-- exactement le même défaut que celui déjà corrigé sur `erase_account()` elle-même (voir le
-- journal des révisions de `0002_identity_consents.sql`, entrée « B1, second audit
-- `code-reviewer` »). Un `authenticated` qui positionnerait lui-même le GUC `app.erasure_user_id`
-- sur son propre uuid (par ex. via une connexion Postgres directe, hors PostgREST — aucune
-- surface HTTP du projet ne permet un `set local` arbitraire, ce qui borne le risque réel)
-- neutraliserait le trigger pour ses propres écritures sur `availability_slots`.
--
-- Correctif : même patron que `erase_account()` — vérifier la revendication `role` du JWT
-- effectivement présenté par l'appelant (`request.jwt.claims`, posé par PostgREST ou explicitement
-- par un appelant `service_role` en connexion directe), qui reflète l'identité réelle et n'est PAS
-- affectée par le changement de `current_user` propre à `security definer`.
--
-- Migration additive uniquement (règle non négociable, cf. tête de `0024_session_placements.sql`) :
-- `create or replace function`, pas de réécriture de `0026`.

create or replace function public.enqueue_placement_refresh() returns trigger
language plpgsql
security definer                      -- `job_queue` a RLS sans policy : inaccessible à `authenticated`
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_erasure_ctx text := nullif(current_setting('app.erasure_user_id', true), '');
  -- Identité réelle de l'appelant : la revendication `role` du JWT qu'il a effectivement présenté
  -- (posée par PostgREST dans `request.jwt.claims`, ou explicitement par un appelant `service_role`
  -- en connexion directe — voir `packages/db/src/__tests__/integration/support/test-clients.ts`).
  -- PAS `current_user` : sous `security definer`, il vaut toujours le propriétaire de cette
  -- fonction, jamais l'appelant (finding N1, seconde passe `code-reviewer`).
  v_caller_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  -- Même garde que `erase_account()` : GUC positionné sur cet utilisateur EXACT, ET revendication
  -- JWT `role = service_role` de l'appelant réel (seul `erase_account()` réunit les deux : elle
  -- pose le GUC après avoir elle-même vérifié cette revendication). Un `authenticated`/`anon` qui
  -- positionnerait le GUC de son propre chef ne franchit pas la seconde condition.
  if v_erasure_ctx is not null
     and v_erasure_ctx = v_user::text
     and v_caller_role = 'service_role'
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
