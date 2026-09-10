-- 0029 — Publication du ruleset `1.0.0` (ADR-007 §1 et §5).
--
-- C'est LA migration d'activation. Elle rompt délibérément avec le régime des migrations 0010, 0021
-- et 0025, qui insèrent toutes `is_active = false` en laissant `supabase/seed.sql` activer un
-- ruleset de développement en local : celles-là seedaient des `0.x-dev`, qui ne doivent jamais être
-- actifs hors local. `1.0.0` est le premier ruleset destiné à la production, et son activation est
-- précisément l'objet de cette migration.
--
-- Ce que `1.0.0` contient : `0.3.0-dev` (garde-fous AC8 validés le 2026-08-06, section hybrid_score
-- d'ADR-014, section planning d'ADR-016) auquel s'ajoutent les huit valeurs arbitrées par le
-- fondateur le 2026-09-10, plus la confirmation des trois paramètres de densité journalière.
-- Sourçage complet et raisonnement : `docs/rulesets/1.0.0.md`.
--
-- Restent volontairement `null`, et c'est licite : `stagnation.nonadherence_completion_rate_threshold`,
-- `stagnation.overload_rpe_trend_threshold` (AC6) et `planning.incident_soft_limit_per_week`
-- (question produit non tranchée). Aucun ne vit dans `params.guardrails`, `params.pain_protocol` ou
-- `params.nutrition` : `ProductionRulesetParamsSchema` ne les exige donc pas, et leur absence
-- n'expose personne (au pire, aucune limite supplémentaire n'est appliquée).
--
-- Dépendance de code : cette publication n'est cohérente qu'avec `MAINTENANCE_KCAL_PER_KG = 40`
-- (`packages/rules-engine/src/pipeline/10-build-nutrition-days.ts`). À 31, la somme des macros
-- dépassait la cible calorique de 14 % et le plafond de déficit portait sur une maintenance
-- sous-estimée d'un quart. Les deux changements forment un seul lot et ne doivent pas être
-- déployés séparément.

insert into rulesets (version, params, source_refs, checksum, is_active, published_at, notes)
select
  '1.0.0',
  (r.params
    || jsonb_build_object(
      'guardrails',   r.params->'guardrails'   || '{"cold_start_volume_ratio": 0.7}'::jsonb,
      'interference', r.params->'interference' || '{"min_hours_between_intense_and_strength_same_groups": 24}'::jsonb,
      'pain_protocol', r.params->'pain_protocol' || '{"persistent_signal_threshold": 3, "persistent_window_days": 14}'::jsonb,
      'nutrition',    r.params->'nutrition'    || $nu${
        "max_daily_deficit_pct": 20,
        "absolute_kcal_floor_male": 1800,
        "absolute_kcal_floor_female": 1400,
        "protein_g_per_kg_range": [1.6, 2.2],
        "carb_modulation_by_session_type": { "rest": 3, "endurance": 5, "intensity": 6 }
      }$nu$::jsonb
    ))::jsonb,
  r.source_refs || $refs${
    "guardrails.cold_start_volume_ratio": {
      "value_ref": "params.guardrails.cold_start_volume_ratio",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC2588639/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Choix de prudence produit, extrapolé : l'auto-déclaration d'activité dépasse la mesure de +44 % en moyenne, et un pic de plus de 10 % au-dessus de la référence des 30 derniers jours multiplie par 1,64 le risque de blessure de surmenage. Démarrer à 70 % absorbe la surestimation ; le volume déclaré est retrouvé en 4 semaines sous le cap de progression de 10 %. Aucune source ne pose la question sous cette forme."
    },
    "pain_protocol.persistent_signal_threshold": {
      "value_ref": "params.pain_protocol.persistent_signal_threshold",
      "sources": ["https://www.nhs.uk/conditions/sprains-and-strains/"],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Choix de prudence produit, extrapolé. Plus petit seuil distinguant une récurrence d'une coïncidence : à 2, une courbature déclarée deux jours de suite mettrait une zone en pause. Lire « 3 signaux pour OUVRIR un épisode » — le moteur pur ne referme jamais un épisode ouvert."
    },
    "pain_protocol.persistent_window_days": {
      "value_ref": "params.pain_protocol.persistent_window_days",
      "sources": ["https://www.nhs.uk/conditions/sprains-and-strains/"],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Calé sur la cinétique de résolution spontanée : la majorité des entorses et élongations vont mieux en deux semaines. Au-delà, le signal est sorti du « ça passe tout seul » et le produit doit cesser d'auto-adapter."
    },
    "nutrition.max_daily_deficit_pct": {
      "value_ref": "params.nutrition.max_daily_deficit_pct",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7052702/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Dérivé d'un rythme de perte de 0,75 %/semaine, entre le rythme recommandé de préférence (0,5 %) et la borne haute (1 %). PLAFOND, jamais une cible : un plan nominal vise 10-15 %. N'a de sens que relativement à MAINTENANCE_KCAL_PER_KG = 40 ; à 31, ces 20 % valaient environ 40 % de déficit réel."
    },
    "nutrition.absolute_kcal_floor_male": {
      "value_ref": "params.nutrition.absolute_kcal_floor_male",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12899827/",
        "https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/understanding-calories/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Dérivé du seuil de faible disponibilité énergétique (< 30 kcal/kg de masse maigre/jour) appliqué à 60 kg de masse maigre. Filet de dernier recours, hors dépense d'exercice — ce qui protège réellement est max_daily_deficit_pct appliqué à une maintenance correcte."
    },
    "nutrition.absolute_kcal_floor_female": {
      "value_ref": "params.nutrition.absolute_kcal_floor_female",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12899827/",
        "https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/understanding-calories/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Même dérivation appliquée à 47 kg de masse maigre. Les minima grand public souvent cités (1200 kcal) n'ont pas pu être rattachés à une source primaire et ne sont donc pas invoqués."
    },
    "nutrition.protein_g_per_kg_range": {
      "value_ref": "params.nutrition.protein_g_per_kg_range",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC6090881/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Valeur la mieux étayée du lot : intersection prudente de deux positions ISSN pour un profil à haut volume. Le moteur applique la MOYENNE (1,9 g/kg/j), au centre de la bande 1,7-2,2. Réserve V2 : la littérature recommande de monter les protéines en déficit, le moteur applique une valeur fixe."
    },
    "nutrition.carb_modulation_by_session_type": {
      "value_ref": "params.nutrition.carb_modulation_by_session_type",
      "sources": ["https://pmc.ncbi.nlm.nih.gov/articles/PMC6090881/"],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Bande ISSN 5-8 g/kg/j pour un entraînement intense modéré ; valeurs calées en bas de fourchette. Le compartiment intensity range AUSSI les séances de force, dont le coût glycolytique est inférieur : 6 g/kg est un compromis entre les deux, pas la valeur juste pour l'une ou l'autre. Séparer les compartiments est une piste V2."
    },
    "interference.min_hours_between_intense_and_strength_same_groups": {
      "value_ref": "params.interference.min_hours_between_intense_and_strength_same_groups",
      "sources": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC8891239/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC12885173/"
      ],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "ASSOUPLIT le repli précédent de 48 h. L'interférence n'est significative que pour deux séances enchaînées dans la même session et seulement sur la force explosive ; dès 3 h de séparation, aucun effet. Converti en jours, 48 h imposait une journée pleine et allégeait systématiquement le travail de force — la modalité dont la valeur préventive est la mieux établie. Le volet intra-journée est couvert plus strictement par planning.min_minutes_between_sessions_same_day = 360."
    },
    "planning.min_minutes_between_sessions_same_day": {
      "value_ref": "params.planning.min_minutes_between_sessions_same_day",
      "sources": ["https://pmc.ncbi.nlm.nih.gov/articles/PMC12885173/"],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Confirmé le 2026-09-10 (ADR-016, question ouverte n°1). Double de la seule borne documentée (3 h). C'est ce paramètre qui porte réellement le volet intra-journée de l'interférence."
    },
    "planning.max_sessions_per_day": {
      "value_ref": "params.planning.max_sessions_per_day",
      "sources": [],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Confirmé le 2026-09-10 (ADR-016, question ouverte n°1). Hypothèse d'ingénierie assumée, jamais confrontée à des données d'usage réelles — à réévaluer quand elles existeront."
    },
    "planning.allow_two_intense_sessions_same_day": {
      "value_ref": "params.planning.allow_two_intense_sessions_same_day",
      "sources": [],
      "confidence": "validated",
      "last_reviewed": "2026-09-10",
      "note": "Confirmé le 2026-09-10 (ADR-016, question ouverte n°1). Cohérent par construction avec le refus AC8 F1 de deux séances intenses consécutives sans repos."
    }
  }$refs$::jsonb,
  '',
  false,
  now(),
  'Ruleset de production 1.0.0 (ADR-007). Reprend 0.3.0-dev et publie les 8 valeurs arbitrées par le fondateur le 2026-09-10 plus les 3 paramètres de densité journalière confirmés. Sourçage : docs/rulesets/1.0.0.md. Cohérent uniquement avec MAINTENANCE_KCAL_PER_KG = 40 dans le moteur.'
from rulesets r
where r.version = '0.3.0-dev'
on conflict (version) do nothing;

update rulesets
set checksum = encode(digest(params::text, 'sha256'), 'hex')
where version = '1.0.0';

-- Activation. L'index unique partiel `rulesets_single_active` n'admet qu'un seul ruleset actif :
-- on désactive donc l'existant AVANT d'activer 1.0.0, dans la même transaction. En local, le
-- ruleset de développement activé par `supabase/seed.sql` est désactivé ici ; le seed ne le
-- réactivera pas, sa clause `not exists (select 1 from rulesets x where x.is_active)` ne se
-- déclenchant que si plus rien n'est actif.
update rulesets set is_active = false where is_active;
update rulesets set is_active = true where version = '1.0.0';
