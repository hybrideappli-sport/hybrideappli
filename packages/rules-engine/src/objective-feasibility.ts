/**
 * `evaluateObjectiveFeasibility` — AC2.
 *
 * Ni la fiche ni `08-architecture.md` ne figent de modèle de performance
 * sportive (question ouverte n°6, `08-architecture.md` §12 : « barème par
 * discipline… non tranché »). Faute de ce barème, `developer` retient une
 * heuristique volontairement simple et documentée, réutilisant un paramètre
 * DÉJÀ validé par le fondateur plutôt que d'inventer une nouvelle catégorie
 * de `ruleset.params` : le plafond de progression hebdomadaire de l'AC8
 * (`guardrails.weekly_volume_progression_cap_pct`) borne aussi, par
 * composition sur le nombre de semaines disponibles, la progression de
 * VOLUME maximale atteignable sans risque avant l'échéance déclarée.
 *
 * `compoundedMax(weeks) = (1 + cap)^weeks - 1` est la hausse de volume
 * hebdomadaire maximale qu'un plan respectueux du garde-fou AC8 peut
 * atteindre en `weeks` semaines. Zones :
 *   - besoin ≤ compoundedMax           → 'realistic'
 *   - compoundedMax < besoin ≤ ×1.5    → 'stretch'   (marge d'incertitude assumée)
 *   - besoin > compoundedMax × 1.5     → 'unrealistic'
 *
 * Ceci est un choix d'ingénierie de `developer`, pas une valeur validée par
 * le fondateur au même titre que le ruleset AC8 — voir le rapport de fin de
 * lot pour la question ouverte associée (le barème par discipline reste à
 * construire, cf. question ouverte n°6).
 */

import type { FeasibilityProposal, FeasibilityResult, PlanningContext, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "./rule-ids";
import type { TraceFactory } from "./lib/trace";
import { addWeeks, diffDays } from "./lib/dates";

const STRETCH_MULTIPLIER = 1.5;
const MIN_BASELINE_WEEKLY_HOURS = 1;

function readTargetWeeklyHours(targetMetric: Record<string, unknown>): number | null {
  const raw = targetMetric["targetWeeklyHours"];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function evaluateObjectiveFeasibility(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): FeasibilityResult {
  const capPct = ruleset.params.guardrails.weekly_volume_progression_cap_pct;
  if (capPct === null) {
    throw new Error(
      "Ruleset invalide : guardrails.weekly_volume_progression_cap_pct est null (requis par evaluateObjectiveFeasibility, ADR-007).",
    );
  }
  const cap = capPct / 100;

  const { objective, profile, now } = context;
  const baselineWeeklyHours = Math.max(profile.declaredWeeklyHours ?? 0, MIN_BASELINE_WEEKLY_HOURS);
  const targetWeeklyHours = readTargetWeeklyHours(objective.targetMetric);

  const inputsUsed = [
    {
      source: "athlete_profiles",
      sourceId: profile.userId,
      field: "declared_weekly_hours",
      value: profile.declaredWeeklyHours,
      observedOn: now,
    },
    {
      source: "objectives",
      sourceId: objective.id,
      field: "target_date",
      value: objective.targetDate,
      observedOn: now,
    },
    {
      source: "objectives",
      sourceId: objective.id,
      field: "target_metric.targetWeeklyHours",
      value: targetWeeklyHours,
      observedOn: now,
    },
  ];

  function makeResult(
    status: FeasibilityResult["status"],
    conditionExpr: string,
    proposals: FeasibilityProposal[],
  ): FeasibilityResult {
    return {
      status,
      proposals,
      trace: traceFactory.make({
        ruleId: RULE_IDS.feasibility,
        ruleVersion: RULE_VERSION,
        category: "feasibility",
        isHardGuardrail: false,
        scope: "objective",
        scopeRefId: objective.id,
        scopeRefDate: null,
        conditionExpr,
        inputsUsed,
        output: { field: "feasibility_status", before: objective.feasibility, after: status, direction: "neutral" },
        severity: status === "unrealistic" ? "warning" : "info",
      }),
    };
  }

  // Sans date cible ou sans cible de volume explicite, rien à négocier : réaliste par défaut
  // (jamais de faux diagnostic — cohérent avec AC7).
  if (objective.targetDate === null || targetWeeklyHours === null) {
    return makeResult("realistic", "no target_date or no explicit weekly-volume target declared", []);
  }

  const weeks = diffDays(now, objective.targetDate) / 7;

  if (weeks <= 0) {
    const newTargetDate = addWeeks(now, 4);
    return makeResult("unrealistic", "target_date already reached or in the past", [
      {
        id: "adjusted_deadline",
        kind: "adjusted_deadline",
        label: "Repousser la date cible",
        targetDate: newTargetDate,
        targetMetric: objective.targetMetric,
        rationale: "La date cible initiale est déjà atteinte ou dépassée : un nouveau délai réaliste est nécessaire.",
      },
    ]);
  }

  const requiredRatio = targetWeeklyHours / baselineWeeklyHours - 1;
  const compoundedMax = Math.pow(1 + cap, weeks) - 1;
  const stretchMax = compoundedMax * STRETCH_MULTIPLIER;

  if (requiredRatio <= compoundedMax) {
    return makeResult("realistic", `requiredRatio(${requiredRatio.toFixed(3)}) <= compoundedMax(${compoundedMax.toFixed(3)})`, []);
  }

  if (requiredRatio <= stretchMax) {
    return makeResult(
      "stretch",
      `compoundedMax(${compoundedMax.toFixed(3)}) < requiredRatio(${requiredRatio.toFixed(3)}) <= stretchMax(${stretchMax.toFixed(3)})`,
      [],
    );
  }

  // unrealistic — AC2 : jamais de plan silencieux, toujours une proposition de négociation.
  const weeksNeeded = Math.max(1, Math.ceil(Math.log(1 + requiredRatio) / Math.log(1 + cap)));
  const adjustedDeadline = addWeeks(now, weeksNeeded);
  const reachableWeeklyHours = Math.round(baselineWeeklyHours * (1 + compoundedMax) * 10) / 10;

  const proposals: FeasibilityProposal[] = [
    {
      id: "adjusted_deadline",
      kind: "adjusted_deadline",
      label: "Repousser la date cible",
      targetDate: adjustedDeadline,
      targetMetric: objective.targetMetric,
      rationale:
        `Atteindre ${targetWeeklyHours}h/semaine depuis ${baselineWeeklyHours}h/semaine en respectant le plafond de ` +
        `progression de ${capPct}%/semaine demande environ ${weeksNeeded} semaines, contre ${Math.ceil(weeks)} disponibles.`,
    },
    {
      id: "intermediate_objective",
      kind: "intermediate_objective",
      label: "Viser un objectif intermédiaire réaliste à la date initiale",
      targetDate: objective.targetDate,
      targetMetric: { ...objective.targetMetric, targetWeeklyHours: reachableWeeklyHours },
      rationale:
        `À la date cible initiale, un volume d'environ ${reachableWeeklyHours}h/semaine est atteignable en respectant ` +
        `le plafond de progression de ${capPct}%/semaine, contre ${targetWeeklyHours}h/semaine visées.`,
    },
  ];

  return makeResult(
    "unrealistic",
    `requiredRatio(${requiredRatio.toFixed(3)}) > stretchMax(${stretchMax.toFixed(3)})`,
    proposals,
  );
}
