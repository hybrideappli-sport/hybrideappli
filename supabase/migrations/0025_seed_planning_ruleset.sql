-- supabase/migrations/0025_seed_planning_ruleset.sql — US-03, Lot L1, ADR-016 §4
-- Source : docs/db-schema.md §11.5 (DDL canonique).
--
-- Renumérotée par `developer` : voir la note de tête de `0024_session_placements.sql`. Désignée
-- `0020_seed_planning_ruleset.sql` par le plan et par `docs/db-schema.md`.
--
-- Ruleset `0.3.0-dev` — reprend INTÉGRALEMENT `0.2.0-dev` (US-02, section `hybrid_score` comprise)
-- et y ajoute la section `planning` (13 paramètres, ADR-016 §4). `0.1.0-dev` et `0.2.0-dev` ne sont
-- ni modifiées ni supprimées (ADR-007 §1). `is_active = false` ici : seul `supabase/seed.sql`, hors
-- production, l'active — même régime défensif que `0.1.0-dev` et `0.2.0-dev`.
--
-- Trois paramètres de densité journalière (`max_sessions_per_day`,
-- `min_minutes_between_sessions_same_day`, `allow_two_intense_sessions_same_day`) sont marqués
-- `to_validate` dans `source_refs` : proposés par `architect`, à confirmer avec les 6 garde-fous
-- AC8 avant la publication d'un ruleset `1.0.0` (ADR-016, question ouverte n°1).
--
-- `incident_soft_limit_per_week` est un `null` NON BLOQUANT (contrairement aux `null` de
-- `params.guardrails`, ADR-007 §4) : sa sémantique est « aucune limite appliquée », état par défaut
-- tant que le fondateur n'a pas tranché la question produit ouverte (fiche §7, `08-architecture.md`
-- §12 question 16). `RulesetParamsSchema` le type `number | null` sans le rendre requis.

insert into rulesets (version, params, source_refs, checksum, is_active, published_at, notes)
select
  '0.3.0-dev',
  (r.params || jsonb_build_object(
    'planning', $pl${
      "slot_windows": {
        "am":          { "start": "06:30", "end": "11:30" },
        "pm":          { "start": "16:30", "end": "21:30" },
        "unspecified": { "start": "06:30", "end": "21:30" }
      },
      "grid_minutes": 30,
      "preferred_start_times": {
        "am":          ["07:00", "06:30", "08:00", "09:00"],
        "pm":          ["18:30", "19:00", "17:30", "20:00"],
        "unspecified": ["18:30", "07:00", "12:30"]
      },
      "default_slot_capacity_min":            120,
      "min_lead_time_min":                     60,
      "min_minutes_between_sessions_same_day": 360,
      "max_sessions_per_day":                   2,
      "allow_two_intense_sessions_same_day": false,
      "incident_block_margin_min":            120,
      "reschedule_scope":          "current_week",
      "closeout_local_hour":                    3,
      "incident_soft_limit_per_week":        null
    }$pl$::jsonb
  ))::jsonb,
  r.source_refs || $refs${
    "planning.min_minutes_between_sessions_same_day": {
      "value_ref": "params.planning.min_minutes_between_sessions_same_day",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-12",
      "note": "ADR-016, question ouverte n°1 — proposé par architect, touche à la densité d'entraînement sur une journée (sécurité), à confirmer avec les 6 garde-fous AC8 avant le ruleset 1.0.0."
    },
    "planning.max_sessions_per_day": {
      "value_ref": "params.planning.max_sessions_per_day",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-12",
      "note": "ADR-016, question ouverte n°1 — idem."
    },
    "planning.allow_two_intense_sessions_same_day": {
      "value_ref": "params.planning.allow_two_intense_sessions_same_day",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-12",
      "note": "ADR-016, question ouverte n°1 — idem."
    },
    "planning.incident_soft_limit_per_week": {
      "value_ref": "params.planning.incident_soft_limit_per_week",
      "sources": [],
      "confidence": "to_validate",
      "last_reviewed": "2026-08-12",
      "note": "Question produit NON tranchée (fiche §7, 08-architecture.md §12 question 16) — null = aucune limite appliquée, état par défaut tant que le fondateur n'a pas tranché."
    }
  }$refs$::jsonb,
  '',
  false,
  null,
  'Ruleset de développement local uniquement (08-architecture.md §9). Reprend 0.2.0-dev (hybrid_score compris) et ajoute la section planning (ADR-016). is_active bascule à true exclusivement via supabase/seed.sql (local uniquement).'
from rulesets r
where r.version = '0.2.0-dev'
on conflict (version) do nothing;

update rulesets
set checksum = encode(digest(params::text, 'sha256'), 'hex')
where version = '0.3.0-dev';
