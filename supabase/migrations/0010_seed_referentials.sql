-- supabase/migrations/0010_seed_referentials.sql
-- Source : docs/db-schema.md §9 (intitulé canonique du contenu attendu) + plan §3.
--
-- Cette migration est rejouée telle quelle sur TOUS les environnements (local, preview, prod —
-- `supabase db reset` comme `supabase db push`). Elle ne doit donc contenir que des données dont
-- l'existence (le schéma de référence), pas l'activation, est requise partout. Toute donnée
-- destinée au seul confort du développement local (activation du ruleset de dev, futurs comptes
-- de démonstration, etc.) vit dans `supabase/seed.sql`, rejoué uniquement par `supabase db reset`
-- / `supabase start` en local (voir `[db.seed]` dans `supabase/config.toml`) — jamais sur un
-- environnement distant. Correction d'audit (code-reviewer, Lot L1, findings B1/I8/B3/M7).
--
-- 1) sports : référentiel initial multi-disciplines. is_documented = true pour ce lot initial
--    (documenté par cette seed) ; tout sport ajouté ultérieurement hors de ce référentiel doit
--    être inséré avec is_documented = false par l'application (question ouverte n°7 : le moteur
--    applique alors un profil générique prudent — la colonne a `default true` au niveau DDL,
--    §5.2 ; c'est au code applicatif de passer explicitement `false` lors de l'ajout à chaud
--    d'un sport non documenté, jusqu'à ce que ce défaut soit revu avec `architect`).
-- 2) consent_documents : medical_disclaimer v1.0.0, health_data_processing v1.0.0, terms v1.0.0,
--    privacy v1.0.0 (fr). Contenu FR rédigé pour ce lot socle — À FAIRE VALIDER JURIDIQUEMENT avant
--    toute mise en production (aucun contenu légal définitif n'existe dans les documents produit
--    fournis à `developer`). Conséquence directe (finding B3, audit Lot L1) : ces 4 documents sont
--    insérés avec `is_current = false`. Rien ne les rend consultables/actifs par défaut. Le
--    basculement à `is_current = true` est un acte volontaire et distinct, réservé à une migration
--    ultérieure dédiée, déclenchée uniquement après validation juridique du contenu — jamais au
--    moment d'un `db reset` initial. Dette tracée explicitement en `08-architecture.md` §12,
--    question ouverte n°8, pour rester actionnable au-delà d'un commentaire de migration.
-- 3) rulesets '0.1.0-dev' : les 6 garde-fous AC8 validés par le fondateur le 2026-08-06
--    (`docs/rulesets/0.1.0-dev.md`) sont portés ici, sourcés (`source_refs`). Les paramètres encore
--    ouverts (interférence, protocole douleur, stagnation hors fenêtres fixées par AC6/AC7,
--    nutrition, `cold_start_volume_ratio`) restent `null`, conformément à ADR-007 §4 et à sa mise à
--    jour du 2026-08-06. Conséquence directe (finding B1, audit Lot L1) : la ligne est insérée ici
--    avec `is_active = false` — le schéma/référentiel doit exister partout, mais aucun ruleset
--    `0.x` ne doit jamais être actif hors local (ADR-007). L'activation (`is_active = true`) est
--    faite exclusivement par `supabase/seed.sql`, non rejoué sur les environnements distants. La
--    validation Zod qui interdira l'activation d'un ruleset `0.x` en production sera construite au
--    Lot L2 (`@hybride/domain`), hors périmètre du Lot L1 — cette séparation migration/seed est la
--    mitigation immédiate en attendant.

-- 1) Référentiel sports ---------------------------------------------------

insert into sports (code, label_fr, family, default_muscle_groups, is_documented) values
  ('running',           'Course à pied',            'endurance', '{quads,hamstrings,glutes,calves,core}', true),
  ('trail_running',     'Trail',                     'endurance', '{quads,hamstrings,glutes,calves,core}', true),
  ('cycling',           'Vélo (route)',              'endurance', '{quads,hamstrings,glutes,calves}',      true),
  ('mountain_biking',   'VTT',                       'endurance', '{quads,hamstrings,glutes,calves,core}', true),
  ('triathlon',         'Triathlon',                 'mixed',     '{full_body}',                           true),
  ('swimming',          'Natation',                  'endurance', '{shoulders,back,core}',                 true),
  ('strength_training', 'Musculation',               'strength',  '{full_body}',                           true),
  ('dance',             'Danse',                      'skill',     '{full_body,core}',                      true),
  ('crossfit',          'CrossFit / cross-training',  'mixed',     '{full_body}',                           true),
  ('football',          'Football',                  'mixed',     '{quads,hamstrings,glutes,calves,core}', true),
  ('tennis',            'Tennis',                     'skill',     '{shoulders,arms,core,quads}',           true),
  ('hiking',            'Randonnée',                 'endurance', '{quads,hamstrings,glutes,calves}',      true),
  ('climbing',          'Escalade',                   'skill',     '{arms,shoulders,back,core}',            true),
  ('rowing',            'Aviron / rameur',            'endurance', '{back,arms,core,quads}',                true),
  ('yoga_pilates',      'Yoga / Pilates',              'skill',     '{core,full_body}',                     true)
on conflict (code) do nothing;

-- 2) Documents de consentement --------------------------------------------

insert into consent_documents (code, version, locale, title, body_md, checksum, is_current) values
(
  'medical_disclaimer',
  '1.0.0',
  'fr',
  'Avertissement — le coach IA n''est pas un professionnel de santé',
  $md$# Avertissement

Le coach IA d'Hybride Club **n'est pas un dispositif médical** et **ne remplace pas l'avis d'un professionnel de santé** (médecin, kinésithérapeute, diététicien, psychologue).

Les recommandations d'entraînement et de nutrition qu'il produit reposent sur un moteur à règles construit à partir de la littérature sportive publique et de bonnes pratiques générales. Elles ne tiennent pas compte de l'ensemble de votre situation médicale personnelle.

En cas de douleur persistante, de signe inhabituel, de pathologie déclarée, de grossesse, ou de tout doute sur votre aptitude à pratiquer une activité physique, **consultez un professionnel de santé** avant de suivre les recommandations de l'application.

En cas de douleur aiguë présente à l'effort et au repos, l'application vous orientera explicitement vers une consultation et cessera de programmer des séances sollicitant la zone concernée.

*Contenu provisoire — à faire valider juridiquement avant mise en production.*
$md$,
  '',
  false
),
(
  'health_data_processing',
  '1.0.0',
  'fr',
  'Consentement au traitement des données de santé',
  $md$# Traitement de vos données de santé

Pour personnaliser votre plan d'entraînement et de nutrition, Hybride Club peut traiter des données considérées comme sensibles au sens du RGPD : fréquence cardiaque, sommeil, poids, douleurs et gênes que vous déclarez.

Ces données sont :

- utilisées uniquement pour générer et ajuster votre plan et vous fournir des explications sur les recommandations ;
- hébergées dans l'Union européenne ;
- jamais transmises à un tiers à des fins commerciales ;
- minimisées avant tout traitement par un fournisseur d'intelligence artificielle externe (aucune donnée directement identifiante ne lui est transmise).

Vous pouvez retirer ce consentement à tout moment depuis votre compte. Le retrait entraîne la purge de ces données et bascule le coach en mode dégradé.

Ce consentement est **distinct** du disclaimer produit et doit être recueilli séparément, avant toute saisie de données de santé (fréquence cardiaque, sommeil, poids, douleur).

*Contenu provisoire — à faire valider juridiquement avant mise en production.*
$md$,
  '',
  false
),
(
  'terms',
  '1.0.0',
  'fr',
  'Conditions générales d''utilisation',
  $md$# Conditions générales d'utilisation (CGU)

En créant un compte sur Hybride Club, vous acceptez les présentes conditions générales d'utilisation.

Hybride Club est un service d'accompagnement sportif et nutritionnel assisté par un moteur à règles autonome et un assistant conversationnel. Le service est proposé en accès libre limité puis par abonnement (voir l'écran Abonnement pour le détail de l'offre en vigueur).

*Contenu provisoire — à faire valider juridiquement avant mise en production.*
$md$,
  '',
  false
),
(
  'privacy',
  '1.0.0',
  'fr',
  'Politique de confidentialité',
  $md$# Politique de confidentialité

Hybride Club traite vos données personnelles conformément au RGPD. Vos données (profil, historique d'entraînement, saisies quotidiennes, données de santé consenties séparément) sont hébergées dans l'Union européenne et ne sont jamais vendues à des tiers.

Vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données, exerçable depuis votre compte (export et suppression) ou par contact direct.

*Contenu provisoire — à faire valider juridiquement avant mise en production.*
$md$,
  '',
  false
)
on conflict (code, version, locale) do nothing;

-- Checksum = empreinte sha256 du contenu (pgcrypto, extension activée en 0001), calculée plutôt
-- que codée en dur pour rester exacte quel que soit le contenu final du texte.
update consent_documents set checksum = encode(digest(body_md, 'sha256'), 'hex');

-- 3) Ruleset de développement 0.1.0-dev -------------------------------------

-- `checksum` est calculé une fois `params` inséré (voir `update` plus bas), à partir de la
-- colonne elle-même — même pattern que `consent_documents` ci-dessus (finding I8, audit Lot L1) :
-- un littéral dupliqué à la main entre `params` et l'argument de `digest(...)` peut diverger
-- silencieusement si l'un des deux est modifié sans l'autre, et de toute façon ne certifie rien
-- sur la donnée réellement stockée (le texte source n'est pas ce que `jsonb` persiste : Postgres
-- normalise l'espacement lors du parsing en `jsonb`). `is_active = false` ici (finding B1) : seul
-- `supabase/seed.sql` active ce ruleset de développement, et uniquement en local.
insert into rulesets (version, params, source_refs, checksum, is_active, published_at, notes)
values (
  '0.1.0-dev',
  $params${
    "guardrails": {
      "weekly_volume_progression_cap_pct": 10,
      "weekly_load_progression_cap_pct": 10,
      "max_intense_sessions_per_week": 2,
      "deload_every_n_blocks": 1,
      "deload_volume_reduction_pct": 45,
      "max_consecutive_days_without_rest": 6,
      "cold_start_volume_ratio": null
    },
    "interference": {
      "min_hours_between_intense_and_strength_same_groups": null,
      "global_load_distribution_strategy": "by_priority"
    },
    "pain_protocol": {
      "persistent_signal_threshold": null,
      "persistent_window_days": null
    },
    "stagnation": {
      "calibration_min_weeks": 4,
      "rolling_window_weeks": 4,
      "nonadherence_completion_rate_threshold": null,
      "overload_rpe_trend_threshold": null
    },
    "nutrition": {
      "max_daily_deficit_pct": null,
      "absolute_kcal_floor_male": null,
      "absolute_kcal_floor_female": null,
      "protein_g_per_kg_range": [null, null],
      "carb_modulation_by_session_type": { "rest": null, "endurance": null, "intensity": null }
    },
    "free_access": {
      "accesses_per_period": 3,
      "window_strategy": "fixed_week"
    }
  }$params$::jsonb,
  $refs${
    "guardrails.weekly_volume_progression_cap_pct": {
      "value_ref": "params.guardrails.weekly_volume_progression_cap_pct",
      "sources": [
        "https://www.pogophysio.com.au/blog/the-10-rule-does-it-hold-true/",
        "https://run.outsideonline.com/training/getting-started/myth-of-the-10-percent-rule/",
        "https://www.ontracx.com/insight/the-10-rule-why-it-fails-as-a-preventive-measure-for-running-related-injuries"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-08-06",
      "note": "Choix de prudence produit assumé, pas un seuil cliniquement prouvé — voir docs/rulesets/0.1.0-dev.md."
    },
    "guardrails.weekly_load_progression_cap_pct": {
      "value_ref": "params.guardrails.weekly_load_progression_cap_pct",
      "sources": [
        "https://www.pogophysio.com.au/blog/the-10-rule-does-it-hold-true/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-08-06"
    },
    "guardrails.max_intense_sessions_per_week": {
      "value_ref": "params.guardrails.max_intense_sessions_per_week",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7967764/",
        "https://www.trainingpeaks.com/blog/are-you-recovering-adequately-between-high-intensity-workouts/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-08-06"
    },
    "guardrails.deload_every_n_blocks": {
      "value_ref": "params.guardrails.deload_every_n_blocks",
      "sources": [
        "https://www.anytimefitness.com/blog/should-you-do-a-deload-week",
        "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10809978/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-08-06"
    },
    "guardrails.deload_volume_reduction_pct": {
      "value_ref": "params.guardrails.deload_volume_reduction_pct",
      "sources": [
        "https://fitbesideshealth.com/deload-weeks/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-08-06"
    },
    "guardrails.max_consecutive_days_without_rest": {
      "value_ref": "params.guardrails.max_consecutive_days_without_rest",
      "sources": [
        "https://www.nike.com/a/how-many-days-a-week-workout",
        "https://www.strongerbyscience.com/training-back-to-back/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-08-06"
    },
    "guardrails.cold_start_volume_ratio": {
      "value_ref": "params.guardrails.cold_start_volume_ratio",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-04",
      "note": "Hors périmètre de la note du 2026-08-06 (docs/rulesets/0.1.0-dev.md §Avertissement) — AC1."
    }
  }$refs$::jsonb,
  '',
  false,
  null,
  'Ruleset de développement local uniquement (08-architecture.md §9). Garde-fous AC8 validés le 2026-08-06 (docs/rulesets/0.1.0-dev.md). Paramètres restants à trancher avant publication de 1.0.0 en production (ADR-007). is_active bascule à true exclusivement via supabase/seed.sql (local uniquement, finding B1 audit Lot L1).'
)
on conflict (version) do nothing;

-- Checksum calculé depuis la colonne réellement stockée (voir commentaire ci-dessus) — finding I8.
update rulesets
set checksum = encode(digest(params::text, 'sha256'), 'hex')
where version = '0.1.0-dev';
