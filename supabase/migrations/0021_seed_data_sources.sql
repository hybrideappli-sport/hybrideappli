-- supabase/migrations/0021_seed_data_sources.sql — US-02, Lot L1
-- Source : docs/db-schema.md §10.8 (désignée `0018` dans la documentation — voir la note de
-- renumérotation en tête de `0018_data_connections.sql`).
--
-- Rejouée telle quelle sur TOUS les environnements (même régime que `0010_seed_referentials.sql`) :
-- référentiels (`data_providers`, `external_sport_mappings`), et EXISTENCE (jamais activation, sauf
-- via `supabase/seed.sql`, hors production, ADR-010 §9) du document de consentement
-- `third_party_data_import` et du ruleset `0.2.0-dev`.

-- 1) Référentiel des sources -------------------------------------------------

insert into data_providers (code, label_fr, kind, description_fr, is_available, display_order) values
  ('strava',            'Strava',           'oauth',  'Synchronise automatiquement tes sorties course, vélo, natation…', true, 10),
  ('strength_manual',   'Musculation',      'manual', 'Saisie manuelle de tes séances de renforcement.',                 true, 20),
  ('nutrition_manual',  'Nutrition',        'manual', 'Saisie manuelle de ton ressenti alimentaire quotidien.',          true, 30)
on conflict (code) do nothing;

-- 2) Cartographie des disciplines Strava -------------------------------------
-- `sport_id` nul ⇒ discipline non cartographiée : la séance est importée sans discipline plutôt
-- que rejetée (AC3). C'est le cas volontaire d'`Elliptical`, sans équivalent direct dans le
-- référentiel `sports` (0010_seed_referentials.sql).

insert into external_sport_mappings (provider_code, external_code, sport_id, default_session_type)
select 'strava', m.external_code,
       (select id from sports where code = m.sport_code),
       m.default_session_type::session_type
from (values
  ('Run',              'running',           'endurance'),
  ('TrailRun',         'trail_running',     'endurance'),
  ('Ride',             'cycling',           'endurance'),
  ('GravelRide',       'cycling',           'endurance'),
  ('MountainBikeRide', 'mountain_biking',   'endurance'),
  ('VirtualRide',      'cycling',           'endurance'),
  ('Swim',             'swimming',          'endurance'),
  ('WeightTraining',   'strength_training', 'strength'),
  ('Workout',          'crossfit',          'cross_training'),
  ('Hike',             'hiking',            'endurance'),
  ('Rowing',           'rowing',            'endurance')
) as m(external_code, sport_code, default_session_type)
on conflict (provider_code, external_code) do nothing;

-- `Elliptical` : aucun sport référentiel équivalent, importé sans discipline (sport_id null).
insert into external_sport_mappings (provider_code, external_code, sport_id, default_session_type)
values ('strava', 'Elliptical', null, 'endurance')
on conflict (provider_code, external_code) do nothing;

-- 3) Document de consentement `third_party_data_import` ---------------------
-- Même régime que les 4 documents F1 (0010_seed_referentials.sql) : `is_current = false` ici,
-- activé hors production uniquement par `supabase/seed.sql` (ADR-013 §5, ADR-010 §9). Le corps
-- énumère EXACTEMENT les champs importés (ADR-013 §4) et explicite ce que le retrait fait et ne
-- fait pas (AC10).

insert into consent_documents (code, version, locale, title, body_md, checksum, is_current) values
(
  'third_party_data_import',
  '1.0.0',
  'fr',
  'Consentement à l''import de données depuis une source tierce',
  $md$# Import de données depuis une source tierce (Strava)

Vous pouvez connecter un compte Strava pour qu'Hybride Club importe automatiquement vos séances, sans ressaisie.

Ce consentement est **distinct** du consentement au traitement des données de santé : il couvre spécifiquement le fait de relier votre compte à un service tiers et de conserver un jeton d'accès permettant d'y lire vos données.

## Ce qui est importé, et uniquement cela

- l'identifiant de l'activité, son type de sport et sa date/heure de début ;
- sa durée écoulée et sa durée en mouvement ;
- sa distance et son dénivelé positif.

## Ce qui n'est jamais importé

- votre fréquence cardiaque (effort ou repos) ;
- votre tracé GPS ou toute coordonnée de localisation ;
- le titre, la description, les photos ou les segments de vos activités ;
- votre puissance.

## Comment ça marche

- la synchronisation est automatique (temps réel via Strava, avec un rattrapage quotidien de sécurité) ;
- les 90 derniers jours d'activités sont importés lors de la première connexion ;
- vous pouvez déconnecter la source à tout moment depuis l'écran Connexion données : la synchronisation s'arrête et le jeton d'accès est supprimé.

## Ce que le retrait de ce consentement fait, et ne fait pas

Retirer ce consentement **arrête tous les imports** depuis toute source tierce connectée et **révoque les connexions actives** : les jetons d'accès sont supprimés.

Il **ne supprime pas** les séances déjà importées : elles restent visibles dans votre historique, simplement affichées comme une saisie déclarée plutôt que synchronisée. Deux voies existent pour effacer ces données : le retrait du consentement au traitement des données de santé (qui purge l'ensemble de votre réalisé), ou la suppression complète de votre compte.

*Contenu provisoire — à faire valider juridiquement avant mise en production.*
$md$,
  '',
  false
)
on conflict (code, version, locale) do nothing;

update consent_documents set checksum = encode(digest(body_md, 'sha256'), 'hex')
where code = 'third_party_data_import' and version = '1.0.0' and locale = 'fr' and checksum = '';

-- 4) Ruleset `0.2.0-dev` — reprend `0.1.0-dev` + section `hybrid_score` (ADR-014 §1, §3) --------
-- `is_active = false` ici : seul `supabase/seed.sql`, hors production, l'active (même régime que
-- `0.1.0-dev`, `0010_seed_referentials.sql`). Valeurs de référence tranchées par le fondateur le
-- 2026-08-12 (ADR-014, questions ouvertes §1).

insert into rulesets (version, params, source_refs, checksum, is_active, published_at, notes)
select
  '0.2.0-dev',
  (r.params || jsonb_build_object(
    'hybrid_score', $hs${
      "weights": { "volume": 0.5, "consistency": 0.3, "diversity": 0.2 },
      "chronic_load_reference_units": 700,
      "target_active_days_per_28d": 20,
      "diversity_reference_disciplines": 3,
      "acute_window_days": 7,
      "chronic_window_days": 28,
      "calibration_min_weeks": 4,
      "min_sessions_for_score": 4
    }$hs$::jsonb
  ))::jsonb,
  r.source_refs || $refs${
    "hybrid_score.weights": {
      "value_ref": "params.hybrid_score.weights",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-12",
      "note": "ADR-014 §1 — pondérations confirmées par le fondateur le 2026-08-12, plafond à 80/100 pour un mono-discipline assumé."
    },
    "hybrid_score.chronic_load_reference_units": {
      "value_ref": "params.hybrid_score.chronic_load_reference_units",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-12",
      "note": "ADR-014, question ouverte n°2 — hypothèse d'ingénierie, à recalibrer sur les premières données réelles."
    }
  }$refs$::jsonb,
  '',
  false,
  null,
  'Ruleset de développement local uniquement (08-architecture.md §9). Reprend 0.1.0-dev et ajoute la section hybrid_score (ADR-014). is_active bascule à true exclusivement via supabase/seed.sql (local uniquement).'
from rulesets r
where r.version = '0.1.0-dev'
on conflict (version) do nothing;

update rulesets
set checksum = encode(digest(params::text, 'sha256'), 'hex')
where version = '0.2.0-dev';
