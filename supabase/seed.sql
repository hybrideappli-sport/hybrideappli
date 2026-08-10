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
-- provisoire `1.0.0` / `fr` des 4 documents pour débloquer le développement, les tests
-- d'intégration et les E2E (ADR-010 §9, docs/db-schema.md §9.3). En production, `is_current`
-- reste `false` tant qu'une migration dédiée n'a pas publié une version juridiquement validée
-- (finding B3, audit Lot L1) : ce fichier n'y est structurellement jamais rejoué.
--
-- Activation DÉFENSIVE : ne bascule `1.0.0` que s'il n'existe pas déjà un document courant pour
-- ce `(code, locale)`, pour ne jamais entrer en collision avec l'index unique partiel
-- `consent_documents_current (code, locale) where is_current` le jour où une migration de
-- production publie une vraie version validée.
update consent_documents d
   set is_current = true
 where d.version = '1.0.0'
   and d.locale  = 'fr'
   and d.code in ('medical_disclaimer','health_data_processing','terms','privacy')
   and not exists (
     select 1 from consent_documents c
      where c.code = d.code and c.locale = d.locale and c.is_current
   );

-- Le contenu provisoire porte lui-même la mention « Contenu provisoire — à faire valider
-- juridiquement avant mise en production » dans son `body_md` : activer ce document hors
-- production ne fait jamais passer un brouillon pour un texte définitif. Voir `08-architecture.md`
-- §12, question ouverte n°10 (et non n°8, qui porte sur la rétention du registre `consents`).
