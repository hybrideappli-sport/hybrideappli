-- supabase/migrations/0012_privilege_hardening.sql
-- Corrections issues de la revue de fin de projet (`reviews/US-01-coach-ia-personnalise-review.md`),
-- findings B5 et I11. La base étant déjà passée par plusieurs migrations rejouées en environnements
-- partagés (dev/preview `hybrideclub`), ces corrections sont portées par une migration ADDITIONNELLE
-- plutôt que par une modification rétroactive de `0001`/`0004` (`08-architecture.md` §9, note du
-- 2026-08-07 : cette liberté « disparaît dès la première donnée de production » — préférée par
-- prudence dès que la base a pu être `db push`-ée au moins une fois hors local).

-- ============================================================================================
-- B5 — `onboarding_sessions.turn_count` est un compteur de SÉCURITÉ (plafond de coût LLM,
-- `MAX_TURNS_PER_SESSION`), pas une donnée déclarative. Le GRANT UPDATE pleine largeur accordé à
-- `authenticated` (`0004_onboarding.sql`) permettait à un client d'exécuter
-- `update onboarding_sessions set turn_count = 0 where id = ...` directement (RLS l'autorise :
-- `user_id = auth.uid()`), rendant le plafond illimité. Seul `profile_draft` est un BROUILLON sans
-- autorité (l'utilisateur valide de toute façon explicitement son profil à l'étape `complete`,
-- AC1) — `turn_count`/`current_step`/`status` doivent rester `service_role` exclusivement. Les
-- routes qui les écrivaient via le client RLS basculent sur le client `service_role` (voir
-- `apps/web/app/api/v1/onboarding/session/**`).
-- ============================================================================================
revoke update on onboarding_sessions from authenticated;
grant update (profile_draft) on onboarding_sessions to authenticated;

-- ============================================================================================
-- I11 — `has_active_consent(p_user, p_code)` est `security definer`, `grant execute … to
-- authenticated` SANS aucun contrôle sur `p_user` : un utilisateur authentifié pouvait interroger
-- l'état de consentement de N'IMPORTE QUEL AUTRE utilisateur
-- (`rpc('has_active_consent', { p_user: <uuid d'autrui>, p_code: 'health_data_processing' })`),
-- une fuite d'information qui contourne par construction tout le modèle RLS. Toutes les
-- utilisations réelles (policies RLS, `apps/web/lib/orchestration/check-consents.ts`) appellent
-- systématiquement cette fonction avec `p_user = auth.uid()` — restreindre au demandeur lui-même
-- (ou à `is_staff()`) ne change donc AUCUN comportement applicatif légitime. Un appel pour un
-- autre `p_user` renvoie `false` plutôt que de lever une exception : indistinguable d'un
-- consentement absent, pour ne pas révéler par le canal d'erreur qu'un `p_user` donné existe.
-- ============================================================================================
create or replace function public.has_active_consent(p_user uuid, p_code text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_user = (select auth.uid()) or is_staff() then coalesce((
      select c.granted and c.revoked_at is null
      from consents c
      where c.user_id = p_user and c.document_code = p_code
      order by c.granted_at desc
      limit 1
    ), false)
    else false
  end;
$$;
-- Le `revoke all` + `grant execute` de `0001_extensions_enums_helpers.sql` reste inchangé
-- (`authenticated, service_role`) : c'est désormais le CORPS de la fonction qui restreint la
-- réponse au demandeur (ou au staff), pas le privilège `EXECUTE` — cohérent avec le fait que les
-- policies RLS elles-mêmes s'exécutent en tant que rôle appelant `authenticated`, pas
-- `service_role`, et doivent donc pouvoir continuer à l'appeler pour LEUR PROPRE `auth.uid()`.
