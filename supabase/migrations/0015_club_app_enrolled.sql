-- Point de coordination avec le site club (repo `hybride-page`, ADR-001 §4 de ce projet-là).
-- Le site partage ce projet Supabase et cette table `profiles` (`auth.users` commune), mais un
-- compte créé pour s'inscrire à une sortie d'un club ne doit pas entrer dans les automatismes
-- commerciaux de l'app sans y avoir réellement engagé — deux responsables de traitement distincts
-- (association loi 1901 / entité commerciale), fuite de finalité RGPD sinon.
--
-- Fuite constatée : `enqueueWeeklyReviews` (apps/web/lib/jobs/enqueue-weekly-reviews.ts) balaie
-- `profiles` sans aucun filtre de rôle ni de statut. Tout compte club recevrait aujourd'hui la
-- révision hebdomadaire applicative (notification + e-mail) — corrigé dans le même lot que cette
-- migration.
--
-- DEFAULT true : les comptes existants (déjà des utilisateurs de l'app) restent enrôlés sans
-- backfill explicite — le défaut s'applique à chaque ligne déjà présente au moment de l'ALTER.
alter table profiles
  add column app_enrolled boolean not null default true;

comment on column profiles.app_enrolled is
  'false = compte créé depuis le parcours du site club (hybride-page), non enrôlé dans les '
  'automatismes commerciaux de l''app tant qu''il n''a pas réellement engagé l''app. Repasse à '
  'true à la complétion de l''onboarding (POST /api/v1/onboarding/session/:id/complete). Tout '
  'job applicatif balayant l''ensemble des profils doit filtrer app_enrolled = true.';

-- Aucun nouveau GRANT : `app_enrolled` est absent du `grant update (...)` de
-- `0002_identity_consents.sql` (display_name, timezone, locale, unit_system, onboarding_status) —
-- un utilisateur `authenticated` ne peut donc pas la modifier après création, par omission plutôt
-- que par revoke, cohérent avec le modèle de privilèges d'ADR-012.
--
-- Nuance à connaître (pas un correctif de cette migration, hors périmètre) : l'INSERT sur
-- `profiles` accordé à `authenticated` (`alter default privileges ... grant insert on tables`,
-- 0001_extensions_enums_helpers.sql) n'est pas restreint par colonne, contrairement à l'UPDATE.
-- Un utilisateur pourrait donc en théorie valoriser `app_enrolled` lui-même dans l'INSERT initial
-- de sa propre ligne. Impact limité : la colonne ne gouverne aucun privilège, seulement
-- l'éligibilité à des jobs d'engagement — au pire un utilisateur s'inclut ou s'exclut lui-même
-- d'un automatisme marketing sur son propre compte. Le parcours de création de compte club
-- (site) écrit de toute façon `profiles` côté serveur avec `service_role`, qui contourne cette
-- question. Si ça doit être fermé plus strictement, ça passe par un `grant insert (colonnes)`
-- explicite touchant l'ensemble du flux d'inscription existant de l'app — hors périmètre ici.
