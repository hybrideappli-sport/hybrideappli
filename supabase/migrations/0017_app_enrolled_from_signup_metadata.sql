-- Corrige le mécanisme d'écriture de `profiles.app_enrolled` (0015) : `handle_new_user()` est un
-- trigger AFTER INSERT sur `auth.users`, commun aux deux origines de compte (app et site club,
-- `auth.users` partagée). C'est LUI qui crée la ligne `profiles`, jamais un appelant côté site —
-- l'hypothèse inverse dans le commentaire de 0015 ("le site insère app_enrolled = false") était
-- fausse : le site ne peut pas insérer avant le trigger, et un UPDATE après coup laisserait une
-- fenêtre entre la création (DEFAULT true) et la correction — silencieuse en cas d'échec de
-- l'appel de correction.
--
-- Correctif retenu : le site passe l'origine dans `raw_user_meta_data` au moment du `signUp()`
-- (`{ data: { origin: 'club' } }`, appel standard Supabase Auth, aucun `service_role` requis côté
-- site pour ce mécanisme) ; `handle_new_user()` en dérive `app_enrolled` dans la MÊME transaction
-- que la création de la ligne — plus de fenêtre. Toute valeur de `raw_user_meta_data.origin` autre
-- que `'club'` (y compris absente) donne `app_enrolled = true`, le défaut sûr pour un compte app.
--
-- Rend sans objet la nuance documentée dans 0015 sur l'INSERT non restreint par colonne : plus
-- aucun appelant client n'insère directement dans `profiles` pour ce flux, la valeur transite par
-- la fonction `security definer`, pas par un INSERT brut de l'appelant.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  insert into public.profiles (id, app_enrolled)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'origin', 'app') is distinct from 'club')
  on conflict (id) do nothing;
  return new;
end $$;

comment on column public.profiles.app_enrolled is
  'false = compte créé depuis le parcours du site club (hybride-page, raw_user_meta_data.origin '
  '= ''club'' au signUp), non enrôlé dans les automatismes commerciaux de l''app tant qu''il n''a '
  'pas réellement engagé l''app. Dérivé par handle_new_user() à la création de la ligne, pas '
  'écrit par un appelant. Repasse à true à la complétion de l''onboarding (POST '
  '/api/v1/onboarding/session/:id/complete). Tout job applicatif balayant l''ensemble des '
  'profils doit filtrer app_enrolled = true.';
