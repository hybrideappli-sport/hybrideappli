-- supabase/migrations/0028_session_placements_supersede_two_phase.sql — US-03, correction découverte
-- en écrivant les tests d'intégration manquants du lot F2/F3 (I5).
--
-- `materializeSessionPlacements()` (`apps/web/lib/planning/materialize-session-placements.ts`) est
-- le SEUL chemin d'écriture de `session_placements`, et deux de ses trois appelants
-- (`resolveScheduleIncident()`, et le job `refresh_placements` via `triggerReason:
-- 'availability_changed'`) redécident des séances qui ont DÉJÀ un placement courant — contrairement
-- à `regeneratePlan()` (séances toujours fraîches, jamais de conflit). Sur ces deux chemins,
-- l'écriture échouait SYSTÉMATIQUEMENT :
--
--   1. `session_placements_current` (index unique PARTIEL, `(planned_session_id) where
--      superseded_at is null`) interdit d'insérer la nouvelle ligne courante tant que l'ancienne
--      n'est pas explicitement superséder — la supersession doit donc précéder l'insertion.
--   2. Mais `session_placements_supersede_coherent` (`(superseded_at is null) = (superseded_by_
--      placement_id is null)`) et la FK `superseded_by_placement_id → session_placements(id)`
--      interdisent de superséder une ligne AVANT que la ligne qui la remplace n'existe déjà.
--
-- Ces deux contraintes s'excluent mutuellement pour toute écriture non transactionnellement
-- différée (chaque appel `supabase-js` est sa propre transaction ; un index unique partiel n'est
-- pas DEFERRABLE en Postgres). Correctif : la cohérence devient à SENS UNIQUE — un successeur
-- connu exige un horodatage, mais un horodatage n'exige plus IMMÉDIATEMENT un successeur connu.
-- `materializeSessionPlacements()` applique désormais la supersession en deux temps :
--   (a) `update … set superseded_at = now()` (successeur encore `null`) — libère l'index unique ;
--   (b) `insert` de la nouvelle ligne ;
--   (c) `update … set superseded_by_placement_id = <nouvel id>` — la ligne existe désormais, la FK
--       et la cohérence sont satisfaites, sans jamais laisser un état où un SUCCESSEUR est connu
--       sans horodatage (l'inverse reste interdit).
--
-- Migration additive uniquement (règle non négociable, cf. tête de `0024_session_placements.sql`).

alter table session_placements
  drop constraint session_placements_supersede_coherent;

alter table session_placements
  add constraint session_placements_supersede_coherent
    check (superseded_by_placement_id is null or superseded_at is not null);
