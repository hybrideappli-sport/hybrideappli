/**
 * `computeHybridScore()` — US-02, ADR-014. Fonction pure, exportée au même titre que
 * `evaluateStagnation`/`evaluateFreeAccess` (`08-architecture.md` §4.1).
 *
 * HORS PIPELINE (ADR-014 §6) : aucune étape de `generatePlan()` n'appelle cette fonction, et elle
 * ne reçoit jamais le `PlanningContext` complet — seulement un `HybridScoreContext` étroit
 * (`@hybride/domain`). Voir `hybrid-score-not-in-pipeline.test.ts`.
 *
 * AC9 — source-agnostique : cette fonction ne lit ni ne connaît `session.source` (le type
 * `HybridScoreSessionInput` ne porte même pas ce champ). Deux contextes identiques en `load_units`
 * produisent STRICTEMENT le même score, quelle que soit la provenance déclarée/connectée des
 * séances qui les composent.
 */

import type { HybridScoreByDayItem, HybridScoreComponents, HybridScoreContext, HybridScoreResult, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids";
import type { TraceFactory } from "../lib/trace";
import { addDays } from "../lib/dates";
import { computeVolumeSubscore } from "./volume";
import { computeConsistencySubscore } from "./consistency";
import { computeDiversitySubscore } from "./diversity";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Nombre de semaines PLEINES écoulées entre deux dates ISO (jamais négatif). */
function fullWeeksBetween(fromIso: string, toIso: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  const days = Math.floor((to - from) / msPerDay);
  return Math.max(0, Math.floor(days / 7));
}

export function computeHybridScore(context: HybridScoreContext, ruleset: Ruleset, traceFactory: TraceFactory): HybridScoreResult {
  const params = ruleset.params.hybrid_score;

  const windowStart = addDays(context.now, -(params.chronic_window_days - 1));
  const windowEnd = context.now;

  // Le moteur ne fait CONFIANCE à aucune pré-filtration de l'appelant sur les bornes : il
  // reborne lui-même à la fenêtre chronique déclarée par le ruleset, pour rester correct même si
  // `context.sessions` porte davantage (ex. réutilisation d'une même requête large côté appelant).
  const sessionsInWindow = context.sessions.filter((session) => session.loggedDate >= windowStart && session.loggedDate <= windowEnd);

  const weeksAvailable = context.firstLoggedDate === null ? 0 : fullWeeksBetween(context.firstLoggedDate, context.now);
  const sessionsCounted = sessionsInWindow.length;

  const volume = computeVolumeSubscore(sessionsInWindow, params.chronic_window_days, params.chronic_load_reference_units);
  const consistency = computeConsistencySubscore(sessionsInWindow, params.target_active_days_per_28d);
  const diversity = computeDiversitySubscore(sessionsInWindow, params.diversity_reference_disciplines);

  const loadUnitsTotal = sessionsInWindow.reduce((sum, session) => sum + session.loadUnits, 0);
  const disciplinesCounted = diversity.byDiscipline.filter((item) => item.sportCode !== null).length;

  const acuteWindowStart = addDays(context.now, -(params.acute_window_days - 1));
  const byDay: HybridScoreByDayItem[] = Array.from({ length: params.acute_window_days }, (_, index) => {
    const date = addDays(acuteWindowStart, index);
    const loadUnits = sessionsInWindow.filter((session) => session.loggedDate === date).reduce((sum, session) => sum + session.loadUnits, 0);
    return { date, loadUnits };
  });

  const components: HybridScoreComponents = {
    volume: { raw: round(volume.raw, 1), normalized: round(volume.normalized, 4) },
    consistency: { raw: consistency.raw, normalized: round(consistency.normalized, 4) },
    diversity: { raw: round(diversity.raw, 4), normalized: round(diversity.normalized, 4) },
  };

  const isCalibration = weeksAvailable < params.calibration_min_weeks || sessionsCounted < params.min_sessions_for_score;

  function makeTrace(conditionExpr: string, category: "calibration" | "hybrid_score", scoreOutput: number | "calibration") {
    return traceFactory.make({
      ruleId: category === "calibration" ? RULE_IDS.hybridScoreCalibration : RULE_IDS.hybridScoreComputed,
      ruleVersion: RULE_VERSION,
      category: "hybrid_score",
      isHardGuardrail: false,
      scope: "hybrid_score",
      scopeRefId: null,
      scopeRefDate: context.now,
      conditionExpr,
      inputsUsed: sessionsInWindow.map((session) => ({
        source: "session_logs_counted",
        sourceId: null,
        field: "load_units",
        value: session.loadUnits,
        observedOn: session.loggedDate,
      })),
      output: { field: "hybrid_score", before: null, after: scoreOutput, direction: "neutral" },
      severity: "info",
    });
  }

  if (isCalibration) {
    return {
      status: "calibration",
      score: null,
      components,
      weeksAvailable,
      weeksRequired: params.calibration_min_weeks,
      sessionsCounted,
      sessionsRequired: params.min_sessions_for_score,
      disciplinesCounted,
      loadUnitsTotal,
      byDiscipline: diversity.byDiscipline,
      byDay,
      windowStart,
      windowEnd,
      trace: makeTrace(
        `weeksAvailable(${weeksAvailable}) < calibrationMinWeeks(${params.calibration_min_weeks}) || sessionsCounted(${sessionsCounted}) < minSessionsForScore(${params.min_sessions_for_score})`,
        "calibration",
        "calibration",
      ),
    };
  }

  const weights = params.weights;
  const weightedSum = weights.volume * volume.normalized + weights.consistency * consistency.normalized + weights.diversity * diversity.normalized;
  // Bornage défensif : garantit `0 ≤ score ≤ 100` même si un ruleset publie des poids dont la
  // somme s'écarte de 1 (le schéma Zod ne l'impose pas structurellement — `RulesetParamsSchema`,
  // `hybrid_score.weights`).
  const score = Math.min(100, Math.max(0, Math.round(100 * weightedSum)));

  return {
    status: "available",
    score,
    components,
    weeksAvailable,
    weeksRequired: params.calibration_min_weeks,
    sessionsCounted,
    sessionsRequired: params.min_sessions_for_score,
    disciplinesCounted,
    loadUnitsTotal,
    byDiscipline: diversity.byDiscipline,
    byDay,
    windowStart,
    windowEnd,
    trace: makeTrace(
      `score = round(100 × (${weights.volume}·${round(volume.normalized, 4)} + ${weights.consistency}·${round(consistency.normalized, 4)} + ${weights.diversity}·${round(diversity.normalized, 4)}))`,
      "hybrid_score",
      score,
    ),
  };
}
