/**
 * `evaluateStagnation` — AC6 (diagnostic différencié) et AC7 (calibration).
 *
 * `context.history.completedWeeks` est supposé trié par `weekStart`
 * croissant (semaine la plus ancienne en premier), comme documenté sur
 * `WeekAggregateSnapshot` dans `@hybride/domain`.
 */

import type { PlanningContext, Ruleset, StagnationEvidenceItem, StagnationRecommendedAction, StagnationResult, WeekAggregateSnapshot } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "./rule-ids";
import type { TraceFactory } from "./lib/trace";

const NO_PROGRESSION_EPSILON = 0.02; // 2% — variation en deçà de ce seuil = stagnation

function requireNonNull(value: number | null, path: string): number {
  if (value === null) {
    throw new Error(`Ruleset invalide pour evaluateStagnation : "${path}" est null (ADR-007).`);
  }
  return value;
}

function average(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

interface PeriodAggregate {
  completionRate: number | null;
  avgRpe: number | null;
  avgFreshness: number | null;
  totalLoadUnits: number | null;
  weightKg: number | null;
  performanceTimeSec: number | null;
  energyAvg: number | null;
}

function aggregate(weeks: WeekAggregateSnapshot[]): PeriodAggregate {
  return {
    completionRate: average(weeks.map((w) => w.completionRate)),
    avgRpe: average(weeks.map((w) => w.avgRpe).filter((v): v is number => v !== null)),
    avgFreshness: average(weeks.map((w) => w.avgFreshness).filter((v): v is number => v !== null)),
    totalLoadUnits: average(weeks.map((w) => w.totalLoadUnits)),
    weightKg: average(weeks.map((w) => w.weightKg).filter((v): v is number => v !== null)),
    performanceTimeSec: average(weeks.map((w) => w.performanceTimeSec).filter((v): v is number => v !== null)),
    energyAvg: average(weeks.map((w) => w.energyAvg).filter((v): v is number => v !== null)),
  };
}

type Indicator = "time" | "load" | "weight" | "energy";

/** Renvoie l'indicateur et le sens d'amélioration ("lower" = plus bas est mieux). */
function pickIndicator(recent: PeriodAggregate, previous: PeriodAggregate): { indicator: Indicator; better: "lower" | "higher" } | null {
  if (recent.performanceTimeSec !== null && previous.performanceTimeSec !== null) {
    return { indicator: "time", better: "lower" };
  }
  if (recent.totalLoadUnits !== null && previous.totalLoadUnits !== null) {
    return { indicator: "load", better: "higher" };
  }
  if (recent.weightKg !== null && previous.weightKg !== null) {
    return { indicator: "weight", better: "lower" };
  }
  if (recent.energyAvg !== null && previous.energyAvg !== null) {
    return { indicator: "energy", better: "higher" };
  }
  return null;
}

function valueFor(agg: PeriodAggregate, indicator: Indicator): number | null {
  switch (indicator) {
    case "time":
      return agg.performanceTimeSec;
    case "load":
      return agg.totalLoadUnits;
    case "weight":
      return agg.weightKg;
    case "energy":
      return agg.energyAvg;
  }
}

export function evaluateStagnation(context: PlanningContext, ruleset: Ruleset, traceFactory: TraceFactory): StagnationResult {
  const calibrationMinWeeks = ruleset.params.stagnation.calibration_min_weeks;
  const rollingWindowWeeks = ruleset.params.stagnation.rolling_window_weeks;
  const weeks = context.history.completedWeeks;
  const weeksAvailable = weeks.length;

  function makeTrace(conditionExpr: string, category: "calibration" | "stagnation", output: { before: unknown; after: unknown }) {
    return traceFactory.make({
      ruleId: category === "calibration" ? RULE_IDS.stagnationCalibration : RULE_IDS.stagnationDiagnosis,
      ruleVersion: RULE_VERSION,
      category,
      isHardGuardrail: false,
      scope: "plan",
      scopeRefId: null,
      scopeRefDate: context.now,
      conditionExpr,
      inputsUsed: weeks.map((w) => ({
        source: "week_aggregates",
        sourceId: null,
        field: "week_start",
        value: w.weekStart,
        observedOn: w.weekStart,
      })),
      output: { field: "stagnation_status", before: output.before, after: output.after, direction: "neutral" },
      severity: "info",
    });
  }

  if (weeksAvailable < calibrationMinWeeks) {
    return {
      status: "calibration",
      weeksAvailable,
      weeksRequired: calibrationMinWeeks,
      indicator: null,
      diagnosis: null,
      evidence: [],
      recommendedAction: null,
      confidence: "calibrating",
      trace: makeTrace(`weeksAvailable(${weeksAvailable}) < calibrationMinWeeks(${calibrationMinWeeks})`, "calibration", {
        before: null,
        after: "calibration",
      }),
    };
  }

  const windowSize = Math.max(2, Math.min(rollingWindowWeeks, Math.floor(weeksAvailable / 2)));
  const recentWeeks = weeks.slice(weeks.length - windowSize);
  const previousWeeks = weeks.slice(weeks.length - 2 * windowSize, weeks.length - windowSize);

  const recent = aggregate(recentWeeks);
  const previous = aggregate(previousWeeks);

  const picked = pickIndicator(recent, previous);

  if (picked === null) {
    return {
      status: "no_stagnation",
      weeksAvailable,
      weeksRequired: calibrationMinWeeks,
      indicator: null,
      diagnosis: null,
      evidence: [],
      recommendedAction: "none",
      confidence: "high",
      trace: makeTrace("no comparable indicator available across both periods", "stagnation", {
        before: null,
        after: "no_stagnation",
      }),
    };
  }

  const recentValue = valueFor(recent, picked.indicator)!;
  const previousValue = valueFor(previous, picked.indicator)!;
  const relativeChange = previousValue === 0 ? 0 : (recentValue - previousValue) / Math.abs(previousValue);
  const improved = picked.better === "higher" ? relativeChange > NO_PROGRESSION_EPSILON : relativeChange < -NO_PROGRESSION_EPSILON;

  const evidence: StagnationEvidenceItem[] = [
    { label: `indicator:${picked.indicator}`, current: recentValue, previous: previousValue },
  ];
  if (recent.completionRate !== null && previous.completionRate !== null) {
    evidence.push({ label: "completion_rate", current: recent.completionRate, previous: previous.completionRate });
  }
  if (recent.avgRpe !== null && previous.avgRpe !== null) {
    evidence.push({ label: "avg_rpe", current: recent.avgRpe, previous: previous.avgRpe });
  }

  if (improved) {
    return {
      status: "no_stagnation",
      weeksAvailable,
      weeksRequired: calibrationMinWeeks,
      indicator: picked.indicator,
      diagnosis: null,
      evidence,
      recommendedAction: "none",
      confidence: "high",
      trace: makeTrace(`indicator ${picked.indicator} improved by ${(relativeChange * 100).toFixed(1)}%`, "stagnation", {
        before: null,
        after: "no_stagnation",
      }),
    };
  }

  // Stagnation détectée — AC6 : diagnostic différencié, jamais de durcissement sur inobservance.
  const nonadherenceThreshold = requireNonNull(
    ruleset.params.stagnation.nonadherence_completion_rate_threshold,
    "stagnation.nonadherence_completion_rate_threshold",
  );
  const overloadRpeTrendThreshold = requireNonNull(
    ruleset.params.stagnation.overload_rpe_trend_threshold,
    "stagnation.overload_rpe_trend_threshold",
  );

  let diagnosis: StagnationResult["diagnosis"];
  let recommendedAction: StagnationRecommendedAction;

  if (recent.completionRate !== null && recent.completionRate < nonadherenceThreshold) {
    diagnosis = "nonadherence";
    // AC6 : jamais de durcissement en réponse à une inobservance détectée.
    recommendedAction = "adjust_to_real_life";
  } else if (
    recent.avgRpe !== null &&
    previous.avgRpe !== null &&
    recent.avgRpe - previous.avgRpe >= overloadRpeTrendThreshold
  ) {
    diagnosis = "overload";
    recommendedAction = "deload";
  } else {
    diagnosis = "understimulation";
    recommendedAction = recent.completionRate !== null && recent.completionRate >= 0.9 ? "increase_load" : "vary_stimulus";
  }

  return {
    status: "stagnation",
    weeksAvailable,
    weeksRequired: calibrationMinWeeks,
    indicator: picked.indicator,
    diagnosis,
    evidence,
    recommendedAction,
    confidence: "high",
    trace: makeTrace(`indicator ${picked.indicator} stagnant, diagnosis=${diagnosis}`, "stagnation", {
      before: null,
      after: "stagnation",
    }),
  };
}
