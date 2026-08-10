/**
 * Étape 6 — `computeWeeklyLoadTarget` (AC8).
 *
 * Le cœur de la sécurité anti-blessure et de l'asymétrie AC4 : c'est ICI que
 * sont appliqués, semaine par semaine :
 *  - le volume de démarrage prudent en régime froid (AC1, AC12) ;
 *  - le plafond de progression hebdomadaire (AC8) ;
 *  - la réduction de décharge sur les semaines marquées à l'étape 5 (AC8) ;
 *  - l'asymétrie hausse/baisse (AC4, ADR-005 §5) : AUCUNE hausse au-delà de
 *    ce que la version de plan précédente montrait déjà à l'utilisateur,
 *    sauf trigger `weekly_review`/`objective_renegotiation` ET absence de
 *    signal négatif actif (AC8, 2ᵉ alinéa) ;
 *  - la baisse immédiate explicite sur signal négatif (AC4) : réduction
 *    proactive de la semaine courante quand `trigger ∈ {negative_signal,
 *    pain_protocol}`.
 *
 * Décision structurante : `direction` d'une trace de progression est
 * TOUJOURS calculée par rapport à `context.previousPlan` (avant = valeur déjà
 * montrée à l'utilisateur pour cette semaine, ou `null` si cette semaine
 * n'existait pas dans une version précédente). Une progression normale à
 * l'intérieur d'un plan tout juste construit (`onboarding`, pas de plan
 * précédent) n'est donc PAS une "hausse" au sens de l'invariant AC4 —
 * `direction = 'neutral'` puisqu'il n'y a rien à comparer. C'est ce qui
 * rend `asymmetry.property.test.ts` vérifiable sans interdire à un plan
 * initial d'être progressif sur sa durée (voir le rapport de fin de lot).
 */

import type {
  AthleteProfileSnapshot,
  DecisionTrace,
  PlanBlockDraft,
  PlanWeekDraft,
  PlanningContext,
  Ruleset,
  TraceDirection,
} from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids";
import type { TraceFactory } from "../lib/trace";
import { requireNonNull } from "../lib/require-non-null";
import { hasActiveNegativeSignal, isIncreaseAllowedForTrigger } from "../lib/guardrail-helpers";

/** Réduction appliquée à la semaine courante quand le trigger EST la réaction à un signal négatif (AC4). */
const NEGATIVE_SIGNAL_LOAD_REDUCTION_PCT = 20;
/** Heuristique de conversion heures déclarées → charge hebdomadaire de référence (documentée, pas un garde-fou AC8). */
const LOAD_UNITS_PER_DECLARED_HOUR = 36; // ≈ 60min × facteur d'intensité moyen (0.6)
const MIN_BASELINE_WEEKLY_LOAD = 60;

function directionOf(before: number, after: number): TraceDirection {
  if (after > before) return "increase";
  if (after < before) return "decrease";
  return "neutral";
}

function computeBaselineWeeklyLoad(context: PlanningContext, profile: AthleteProfileSnapshot): number {
  if (context.dataRegime !== "cold" && context.history.completedWeeks.length > 0) {
    const recent = context.history.completedWeeks.slice(-4);
    const avg = recent.reduce((sum, w) => sum + w.totalLoadUnits, 0) / recent.length;
    if (avg > 0) return Math.round(avg);
  }
  const hours = profile.declaredWeeklyHours ?? (profile.declaredWeeklySessions ? profile.declaredWeeklySessions : 3);
  return Math.max(MIN_BASELINE_WEEKLY_LOAD, Math.round(hours * LOAD_UNITS_PER_DECLARED_HOUR));
}

export function computeWeeklyLoadTarget(
  weeksSkeleton: PlanWeekDraft[],
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { weeks: PlanWeekDraft[]; traces: DecisionTrace[] } {
  const capPct = requireNonNull(ruleset.params.guardrails.weekly_load_progression_cap_pct, "guardrails.weekly_load_progression_cap_pct");
  const deloadReductionPct = requireNonNull(
    ruleset.params.guardrails.deload_volume_reduction_pct,
    "guardrails.deload_volume_reduction_pct",
  );

  const baselineWeeklyLoad = computeBaselineWeeklyLoad(context, context.profile);
  const previousByWeekStart = new Map((context.previousPlan?.weeks ?? []).map((w) => [w.weekStart, w] as const));

  const allowIncrease =
    isIncreaseAllowedForTrigger(context.trigger) &&
    !hasActiveNegativeSignal(context.now, context.history.sessionLogs, context.painEpisodes);

  const traces: DecisionTrace[] = [];
  const updatedWeeks: PlanWeekDraft[] = [];
  let runningTarget = baselineWeeklyLoad;

  weeksSkeleton.forEach((week, i) => {
    let proposedAfter: number;
    let ruleId: string;
    let isHardGuardrail = false;
    let conditionExpr: string;

    if (i === 0 && context.dataRegime === "cold") {
      const ratio = requireNonNull(ruleset.params.guardrails.cold_start_volume_ratio, "guardrails.cold_start_volume_ratio");
      proposedAfter = Math.round(baselineWeeklyLoad * ratio);
      ruleId = RULE_IDS.coldStart;
      isHardGuardrail = true;
      conditionExpr = `dataRegime = 'cold' ⇒ baseline(${baselineWeeklyLoad}) × cold_start_volume_ratio(${ratio})`;
    } else if (week.isDeload) {
      proposedAfter = Math.round(runningTarget * (1 - deloadReductionPct / 100));
      ruleId = RULE_IDS.deloadInserted;
      isHardGuardrail = true;
      conditionExpr = `is_deload ⇒ previous(${runningTarget}) × (1 − deload_volume_reduction_pct(${deloadReductionPct}%))`;
    } else if (i === 0) {
      proposedAfter = baselineWeeklyLoad;
      ruleId = RULE_IDS.weeklyLoadTarget;
      conditionExpr = "first week ⇒ baseline";
    } else {
      proposedAfter = Math.round(runningTarget * (1 + capPct / 100));
      ruleId = RULE_IDS.weeklyLoadTarget;
      isHardGuardrail = true;
      conditionExpr = `previous(${runningTarget}) × (1 + weekly_load_progression_cap_pct(${capPct}%))`;
    }

    const previousWeek = previousByWeekStart.get(week.weekStart);
    const before = previousWeek ? previousWeek.targetLoadUnits : null;
    let after = proposedAfter;
    let direction: TraceDirection = before === null ? "neutral" : directionOf(before, after);

    if (before !== null && direction === "increase" && !allowIncrease) {
      after = before;
      direction = "neutral";
      ruleId = hasActiveNegativeSignal(context.now, context.history.sessionLogs, context.painEpisodes)
        ? RULE_IDS.noIncreaseActiveSignal
        : RULE_IDS.noIncreaseAsymmetry;
      isHardGuardrail = true;
      conditionExpr = `proposed(${proposedAfter}) > previousPlan(${before}) but trigger='${context.trigger}' does not allow increase`;
    }

    runningTarget = after;

    const trace = traceFactory.make({
      ruleId,
      ruleVersion: RULE_VERSION,
      category: "guardrail",
      isHardGuardrail,
      scope: "week",
      scopeRefId: null,
      scopeRefDate: week.weekStart,
      conditionExpr,
      inputsUsed: [
        { source: "athlete_profiles", sourceId: context.profile.userId, field: "declared_weekly_hours", value: context.profile.declaredWeeklyHours, observedOn: context.now },
        { source: "plan_versions", sourceId: null, field: "trigger", value: context.trigger, observedOn: context.now },
      ],
      output: { field: "target_load_units", before, after, direction },
      severity: isHardGuardrail ? "warning" : "info",
    });
    traces.push(trace);

    updatedWeeks.push({ ...week, targetLoadUnits: after, traceIds: [...week.traceIds, trace.id] });
  });

  // AC4 — baisse immédiate explicite sur la semaine courante, réaction à un signal négatif.
  if ((context.trigger === "negative_signal" || context.trigger === "pain_protocol") && updatedWeeks.length > 0) {
    const first = updatedWeeks[0]!;
    const reduced = Math.round(first.targetLoadUnits * (1 - NEGATIVE_SIGNAL_LOAD_REDUCTION_PCT / 100));
    const trace = traceFactory.make({
      ruleId: "progression.negative_signal_reduction",
      ruleVersion: RULE_VERSION,
      category: "progression",
      isHardGuardrail: false,
      scope: "week",
      scopeRefId: null,
      scopeRefDate: first.weekStart,
      conditionExpr: `trigger='${context.trigger}' ⇒ reduce current week by ${NEGATIVE_SIGNAL_LOAD_REDUCTION_PCT}%`,
      inputsUsed: [{ source: "plan_versions", sourceId: null, field: "trigger", value: context.trigger, observedOn: context.now }],
      output: { field: "target_load_units", before: first.targetLoadUnits, after: reduced, direction: "decrease" },
      severity: "info",
    });
    traces.push(trace);
    updatedWeeks[0] = { ...first, targetLoadUnits: reduced, traceIds: [...first.traceIds, trace.id] };
  }

  return { weeks: updatedWeeks, traces };
}

/**
 * Agrégation post-étape-6 : `target_load_units` de chaque bloc = somme des
 * semaines qui le composent. Émet une trace dédiée par bloc — ce chiffre
 * n'existait pas encore à l'étape 4 (blocs créés avec `targetLoadUnits = 0`).
 */
export function aggregateBlockTargets(
  blocks: PlanBlockDraft[],
  weeks: PlanWeekDraft[],
  traceFactory: TraceFactory,
): { blocks: PlanBlockDraft[]; traces: DecisionTrace[] } {
  const traces: DecisionTrace[] = [];
  const updatedBlocks = blocks.map((block) => {
    const total = weeks.filter((w) => w.blockIndex === block.blockIndex).reduce((sum, w) => sum + w.targetLoadUnits, 0);
    const trace = traceFactory.make({
      ruleId: "progression.block_aggregate",
      ruleVersion: RULE_VERSION,
      category: "progression",
      isHardGuardrail: false,
      scope: "block",
      scopeRefId: String(block.blockIndex),
      scopeRefDate: block.startDate,
      conditionExpr: "sum(week.targetLoadUnits) for weeks in this block",
      inputsUsed: [],
      output: { field: "target_load_units", before: null, after: total, direction: "neutral" },
      severity: "info",
    });
    traces.push(trace);
    return { ...block, targetLoadUnits: total, traceIds: [...block.traceIds, trace.id] };
  });
  return { blocks: updatedBlocks, traces };
}
