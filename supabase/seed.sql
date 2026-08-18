-- supabase/seed.sql
-- Rejoué en local (`supabase db reset` / `supabase start`, voir `[db.seed]` dans
-- `supabase/config.toml`) ET à la création d'une branche preview Supabase. JAMAIS exécuté en
-- PRODUCTION : seules les migrations y sont propagées, les seeds ne le sont jamais. C'est la
-- garantie technique derrière ADR-007 (« aucun ruleset 0.x ne peut être activé en production »)
-- et derrière le finding B1 de l'audit Lot L1 (`code-reviewer`) — son périmètre exact est
-- « jamais en production », pas « jamais sur un environnement distant » (docs/db-schema.md §9).
--
-- Toute donnée insérée par la migration `0010_seed_referentials.sql` existe déjà quand ce fichier
-- s'exécute (les seeds sont appliqués après les migrations). Ce fichier ne fait qu'ACTIVER, pour le
-- confort du développement local et des previews, des données déjà présentes en base — il ne crée
-- aucune ligne.

-- Ruleset de développement `0.1.0-dev` : inséré `is_active = false` par la migration 0010 (le
-- référentiel doit exister partout). Seuls les environnements hors production l'activent, ici, par
-- un `UPDATE` de confort — rendu DÉFENSIF : il ne bascule `0.1.0-dev` que si aucun ruleset n'est
-- déjà actif. Sans cette garde, le jour où une migration de production publie un ruleset `1.0.0`
-- actif, le prochain `supabase db reset` local rejouerait ce seed après cette migration et
-- violerait l'index unique global `rulesets_single_active` (docs/db-schema.md §9.3).
update rulesets
set is_active = true,
    published_at = coalesce(published_at, now())
where version = '0.1.0-dev'
  and not exists (
    select 1 from rulesets r where r.is_active
  );

-- `consent_documents.is_current` : hors production uniquement, ce seed active la version
-- provisoire `1.0.0` / `fr` de 3 des 4 documents (`medical_disclaimer`, `terms`, `privacy`) pour
-- débloquer le développement, les tests d'intégration et les E2E (ADR-010 §9, docs/db-schema.md
-- §9.3). En production, `is_current` reste `false` tant qu'une migration dédiée n'a pas publié une
-- version juridiquement validée (finding B3, audit Lot L1) : ce fichier n'y est structurellement
-- jamais rejoué.
--
-- `health_data_processing` est traité séparément juste après : depuis
-- `0014_health_data_processing_consent_v1_1_0.sql`, sa version provisoire hors production est
-- `1.1.0`, pas `1.0.0` (texte amendé pour rester cohérent avec la conservation, au retrait, des
-- indicateurs de sécurité `risk_flags` 'pathology'/'minor' -- interaction B1 x B6, 576bbf2).
--
-- Activation DÉFENSIVE : ne bascule `1.0.0` que s'il n'existe pas déjà un document courant pour
-- ce `(code, locale)`, pour ne jamais entrer en collision avec l'index unique partiel
-- `consent_documents_current (code, locale) where is_current` le jour où une migration de
-- production publie une vraie version validée.
update consent_documents d
   set is_current = true
 where d.version = '1.0.0'
   and d.locale  = 'fr'
   and d.code in ('medical_disclaimer','terms','privacy')
   and not exists (
     select 1 from consent_documents c
      where c.code = d.code and c.locale = d.locale and c.is_current
   );

-- `health_data_processing` : même activation défensive, sur sa version provisoire `1.1.0` (au lieu
-- de `1.0.0`) -- voir `0014_health_data_processing_consent_v1_1_0.sql` pour le détail du correctif.
update consent_documents d
   set is_current = true
 where d.version = '1.1.0'
   and d.locale  = 'fr'
   and d.code    = 'health_data_processing'
   and not exists (
     select 1 from consent_documents c
      where c.code = d.code and c.locale = d.locale and c.is_current
   );

-- Le contenu provisoire porte lui-même la mention « Contenu provisoire — à faire valider
-- juridiquement avant mise en production » dans son `body_md` : activer ce document hors
-- production ne fait jamais passer un brouillon pour un texte définitif. Voir `08-architecture.md`
-- §12, question ouverte n°10 (et non n°8, qui porte sur la rétention du registre `consents`).

-- Lot L3 (`developer`, 2026-08-10) — complète, HORS PRODUCTION uniquement, les paramètres du
-- ruleset `0.1.0-dev` qui restent `null` après la migration 0010 : `guardrails.cold_start_volume_ratio`
-- (AC1/AC12 — nécessaire pour générer un premier plan en régime froid), `interference.*` (AC10),
-- `pain_protocol.*` (AC9) et `nutrition.*` (AC11, y compris les planchers de sécurité). Sans ces
-- valeurs, `generatePlan()` lève une exception dès la première génération de plan
-- (`requireNonNull`, voir `packages/rules-engine/src/pipeline/06-*` et `10-*`) : le Lot L3 ne peut
-- pas être testé de bout en bout tant qu'elles restent `null`, y compris en local.
--
-- Valeurs IDENTIQUES à celles déjà posées par `developer` au Lot L2 dans la fixture de test
-- `packages/rules-engine/__fixtures__/ruleset.ts` (`TEST_RULESET`, catégorie `to_validate`) — même
-- statut : des placeholders documentés de `developer`, PAS des valeurs validées par le fondateur au
-- sens ADR-007 (qui ne porte que sur les 6 garde-fous `guardrails.*`, déjà tous non-null et
-- inchangés ici). Ce correctif est scopé au SEUL environnement de développement/preview par le même
-- mécanisme que le reste de ce fichier (jamais rejoué en production) — voir le rapport de fin de
-- lot de `developer` pour le détail de cette décision, signalée comme question ouverte.
update rulesets
set params = params || jsonb_build_object(
  'guardrails', (params->'guardrails') || jsonb_build_object('cold_start_volume_ratio', 0.7),
  'interference', jsonb_build_object(
    'min_hours_between_intense_and_strength_same_groups', 48,
    'global_load_distribution_strategy', coalesce(params->'interference'->>'global_load_distribution_strategy', 'by_priority')
  ),
  'pain_protocol', jsonb_build_object(
    'persistent_signal_threshold', 3,
    'persistent_window_days', 14
  ),
  'nutrition', jsonb_build_object(
    'max_daily_deficit_pct', 20,
    'absolute_kcal_floor_male', 1500,
    'absolute_kcal_floor_female', 1200,
    'protein_g_per_kg_range', jsonb_build_array(1.6, 2.2),
    'carb_modulation_by_session_type', jsonb_build_object('rest', 2.5, 'endurance', 4, 'intensity', 6)
  )
)
where version = '0.1.0-dev';

-- US-02 (`developer`, Lot L1) — deux activations DÉFENSIVES supplémentaires, même patron que
-- ci-dessus (`docs/db-schema.md` §10.8) : chaque clause ne bascule sa cible que si aucune autre
-- ligne du même groupe n'est déjà active/courante, pour ne jamais entrer en collision avec l'index
-- unique partiel correspondant (`consent_documents_current`, `rulesets_single_active`) le jour où
-- une migration de production publie une vraie version.
--
-- `third_party_data_import` v1.0.0 : contenu provisoire, activé hors production uniquement
-- (ADR-013 §5).
update consent_documents d
   set is_current = true
 where d.code = 'third_party_data_import' and d.version = '1.0.0' and d.locale = 'fr'
   and not exists (select 1 from consent_documents c
                    where c.code = d.code and c.locale = d.locale and c.is_current);

-- `0.2.0-dev` (hybrid_score, ADR-014) : n'active ce ruleset que si AUCUN ruleset n'est déjà actif.
-- Le bloc `0.1.0-dev` ci-dessus s'exécute en premier dans ce fichier et gagne systématiquement en
-- l'état actuel — c'est voulu : ADR-014 §3 rend la section `hybrid_score` optionnelle avec valeurs
-- par défaut appliquées à la lecture, précisément pour que `0.1.0-dev` reste un ruleset actif valide
-- pour le score hybride sans qu'aucune section dédiée n'y soit publiée.
update rulesets r set is_active = true
 where r.version = '0.2.0-dev'
   and not exists (select 1 from rulesets x where x.is_active);

-- `0.3.0-dev` (planning, ADR-016) : même clause DÉFENSIVE, même raison — `0.1.0-dev` reste le
-- ruleset actif en local tant que ce fichier s'exécute dans cet ordre, et c'est voulu : la section
-- `planning` est optionnelle avec défauts (docs/db-schema.md §11.5, ADR-016 §4), exactement comme
-- `hybrid_score` ci-dessus, précisément pour que `0.1.0-dev` reste un ruleset actif valide pour le
-- placement horaire sans qu'aucune section dédiée n'y soit publiée.
update rulesets r set is_active = true
 where r.version = '0.3.0-dev'
   and not exists (select 1 from rulesets x where x.is_active);
