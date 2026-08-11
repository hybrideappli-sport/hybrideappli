/**
 * `generatePlan(context, ruleset): EngineResult` — le point d'entrée
 * principal du moteur (`08-architecture.md` §4.1-4.2).
 *
 * Exécute le pipeline en 12 étapes, DANS L'ORDRE IMPOSÉ par l'architecture.
 * Fonction pure : aucune I/O, `context.now` est la SEULE source de temps,
 * aucun aléa non injecté.
 */

import type { DecisionTrace, EngineResult, PlanDraft, PlanningContext, Ruleset } from "@hybride/domain";
import { createTraceFactory } from "./lib/trace";
import { addDays } from "./lib/dates";

import { resolveRiskRestrictions } from "./pipeline/01-resolve-risk-restrictions";
import { resolvePainState } from "./pipeline/02-resolve-pain-state";
import { resolveObjectiveFeasibility } from "./pipeline/03-resolve-objective-feasibility";
import { buildMacroBlocks } from "./pipeline/04-build-macro-blocks";
import { placeMandatoryDeloads } from "./pipeline/05-place-mandatory-deloads";
import { aggregateBlockTargets, computeWeeklyLoadTarget } from "./pipeline/06-compute-weekly-load-target";
import { distributeAcrossSports } from "./pipeline/07-distribute-across-sports";
import { resolveInterference } from "./pipeline/08-resolve-interference";
import { buildSessions } from "./pipeline/09-build-sessions";
import { buildNutritionDays } from "./pipeline/10-build-nutrition-days";
import { applyHardGuardrails } from "./pipeline/11-apply-hard-guardrails";
import { assertEveryNumberIsTraced } from "./pipeline/12-assert-every-number-is-traced";

export function generatePlan(context: PlanningContext, ruleset: Ruleset): EngineResult {
  const traceFactory = createTraceFactory(ruleset.version);
  const traces: DecisionTrace[] = [];

  // 1. AC3 — restrictions dures issues de risk_flags.
  const risk = resolveRiskRestrictions(context, traceFactory);
  traces.push(...risk.traces);

  // 2. AC9 — zones bloquées / en pause / adaptées.
  const pain = resolvePainState(context, ruleset, traceFactory);
  traces.push(...pain.traces);

  // 3. AC2 — realistic | stretch | unrealistic (tracé, ne bloque pas la construction du plan :
  //    la bifurcation "négociation AVANT génération" est une responsabilité de l'orchestrateur).
  const feasibility = resolveObjectiveFeasibility(context, ruleset, traceFactory);
  traces.push(...feasibility.traces);

  // 4. AC1 — blocs macro + squelette hebdomadaire complet (AC14 — géré ici, voir le fichier).
  const macro = buildMacroBlocks(context, ruleset, traceFactory);
  traces.push(...macro.traces);

  // 5. AC8 — décharge obligatoire, non désactivable.
  const deloaded = placeMandatoryDeloads(macro.blocks, macro.weeks, ruleset, traceFactory);
  traces.push(...deloaded.traces);

  // 6. AC8/AC4 — plafond de progression, asymétrie hausse/baisse.
  const loadTargets = computeWeeklyLoadTarget(deloaded.weeks, context, ruleset, traceFactory);
  traces.push(...loadTargets.traces);

  const blockAgg = aggregateBlockTargets(macro.blocks, loadTargets.weeks, traceFactory);
  traces.push(...blockAgg.traces);

  // 7. AC10 — charge globale, pas par sport isolé.
  const sportDistribution = distributeAcrossSports(context, ruleset, traceFactory);
  traces.push(...sportDistribution.traces);

  // 8. AC10 — politique d'espacement intense ↔ force, mêmes groupes.
  const interference = resolveInterference(context, ruleset, traceFactory);
  traces.push(...interference.traces);

  // 9. AC1, AC4, AC9, AC10 — séances J → J+7 (détail) et J+8 → J+14 (intention).
  const builtSessions = buildSessions({
    context,
    ruleset,
    weeks: loadTargets.weeks,
    allocations: sportDistribution.allocations,
    painState: pain.painState,
    minDaysBetweenIntenseAndStrengthSameGroups: interference.minDaysBetweenIntenseAndStrengthSameGroups,
    traceFactory,
  });
  traces.push(...builtSessions.traces);

  // 10. AC11 — nutrition modulée à la séance, plancher de sécurité. Uniquement J → J+6.
  const detailedDays = Array.from({ length: 7 }, (_, i) => addDays(context.now, i));
  const sessionsByDate = new Map(builtSessions.sessions.filter((s) => s.detailLevel === "detailed").map((s) => [s.scheduledDate, s]));
  const nutrition = buildNutritionDays(detailedDays, sessionsByDate, context, ruleset, risk.restrictions, traceFactory);
  traces.push(...nutrition.traces);

  // 11. AC8 — TERMINALE : écrase tout le reste si un garde-fou est encore dépassé.
  const guardrails = applyHardGuardrails(loadTargets.weeks, builtSessions.sessions, ruleset, traceFactory);
  traces.push(...guardrails.traces);

  const plan: PlanDraft = {
    objectiveId: context.objective.id,
    startedOn: context.now,
    horizonStart: blockAgg.blocks[0]!.startDate,
    horizonEnd: blockAgg.blocks[blockAgg.blocks.length - 1]!.endDate,
    blocks: blockAgg.blocks,
    weeks: guardrails.weeks,
    sessions: guardrails.sessions,
    nutritionDays: nutrition.nutritionDays,
  };

  // 12. Assertion terminale — échoue le run plutôt que de persister une valeur non tracée.
  assertEveryNumberIsTraced(plan, traces);

  const confidence = context.history.completedWeeks.length < ruleset.params.stagnation.calibration_min_weeks ? "calibrating" : "high";

  return { plan, traces, guardrailsApplied: guardrails.guardrailsApplied, confidence };
}
