-- supabase/migrations/0022_hybrid_score_engine_run_trigger.sql — US-02, ADR-014 §5
--
-- `computeHybridScore()` est une fonction moteur TOP-LEVEL au même titre qu'`evaluatePainProtocol()`
-- (`08-architecture.md` §4.1) : sa décision mérite sa propre auditabilité (`engine_runs` +
-- `decision_traces`), même hors de toute génération de plan (ADR-014 §6 : elle n'en déclenche
-- aucune). `engine_runs.trigger` est contraint par l'enum `plan_trigger` (`0001_extensions_enums_
-- helpers.sql`) — déjà réutilisé pour `pain_protocol`, qui n'est pas non plus un déclencheur de
-- génération de plan à proprement parler (`apply-daily-log.ts`). Cette migration ajoute une valeur
-- `hybrid_score`, de la même manière, additive.
--
-- `alter type ... add value` ne peut pas être utilisée dans la MÊME transaction que la valeur
-- ajoutée (restriction PostgreSQL) : cette migration ne fait qu'ajouter la valeur, jamais l'utiliser
-- — le premier `insert` la référençant a lieu dans une transaction ultérieure, à l'exécution de
-- `lib/score/compute-and-store-hybrid-score.ts`.

alter type plan_trigger add value 'hybrid_score';
