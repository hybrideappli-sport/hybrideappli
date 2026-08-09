-- supabase/seed.sql
-- Rejoué uniquement en local (`supabase db reset` / `supabase start`), voir `[db.seed]` dans
-- `supabase/config.toml`. JAMAIS exécuté sur un environnement distant (preview, prod) : c'est la
-- garantie technique derrière ADR-007 (« aucun ruleset 0.x ne peut être activé en production »)
-- et derrière le finding B1 de l'audit Lot L1 (`code-reviewer`).
--
-- Toute donnée insérée par la migration `0010_seed_referentials.sql` existe déjà quand ce fichier
-- s'exécute (les seeds sont appliqués après les migrations). Ce fichier ne fait qu'ACTIVER, pour le
-- confort du développement local, des données déjà présentes en base — il ne crée aucune ligne.

-- Ruleset de développement `0.1.0-dev` : inséré `is_active = false` par la migration 0010 (le
-- référentiel doit exister partout). Seul l'environnement local l'active, ici, par un simple
-- `UPDATE` de confort (à distinguer du mécanisme d'activation en production, tracé et réservé à
-- une fonction `service_role` dédiée — voir le commentaire sur `rulesets_single_active` en
-- `0005_engine_audit.sql` — hors périmètre d'un script de seed).
update rulesets
set is_active = true,
    published_at = coalesce(published_at, now())
where version = '0.1.0-dev';

-- NB : `consent_documents.is_current` reste volontairement `false` pour les 4 documents, y
-- compris ici en local (finding B3, audit Lot L1) : leur contenu est provisoire et non validé
-- juridiquement. Ne pas les activer, même pour le confort du développement local — voir
-- `08-architecture.md` §12, question ouverte n°8.
