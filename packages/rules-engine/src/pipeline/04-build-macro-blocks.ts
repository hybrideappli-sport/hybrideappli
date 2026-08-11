/**
 * Étape 4 — `buildMacroBlocks` (AC1).
 *
 * Découpe l'horizon (aujourd'hui → date d'objectif, ou un horizon par défaut
 * si aucune date n'est déclarée — objectif de type `general_fitness`) en
 * blocs méso de `MESO_BLOCK_WEEKS` semaines, typés base/développement/
 * spécifique/affûtage, et construit le squelette hebdomadaire complet de
 * l'horizon (ADR-004 §3 : `plan_weeks` existe pour TOUTE la durée, y compris
 * au-delà de J+14 où seule une charge agrégée est portée).
 *
 * `MESO_BLOCK_WEEKS` est un choix de périodisation de `developer` (pas une
 * valeur validée par le fondateur au sens ADR-007) — il fait volontairement
 * coïncider la longueur de bloc avec `deload_every_n_blocks = 1` du ruleset
 * `0.1.0-dev` (`docs/rulesets/0.1.0-dev.md` §4-5 : "le modèle de plan…
 * découpe déjà le méso en blocs de 3-4 semaines").
 */

import type { BlockType, DecisionTrace, PlanBlockDraft, PlanWeekDraft, PlanningContext, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids";
import type { TraceFactory } from "../lib/trace";
import { addDays, addWeeks, diffDays, isoWeekLabel, startOfIsoWeek } from "../lib/dates";
import { requireNonNull } from "../lib/require-non-null";

const MESO_BLOCK_WEEKS = 4;
const DEFAULT_HORIZON_WEEKS_WITHOUT_TARGET_DATE = 16;
/** Garde-fou de performance pour le property-based testing (dates cibles extrêmes). */
const MAX_HORIZON_WEEKS = 78;

function blockTypeForIndex(index: number, total: number): BlockType {
  if (total === 1) return "specific";
  if (index === total - 1) return "taper";
  const progress = index / (total - 1);
  if (progress < 0.4) return "base";
  if (progress < 0.75) return "build";
  return "specific";
}

function focusForBlockType(blockType: BlockType): string {
  switch (blockType) {
    case "base":
      return "Construction de la base aérobie et de la régularité";
    case "build":
      return "Développement de la capacité spécifique";
    case "specific":
      return "Travail spécifique à l'objectif";
    case "taper":
      return "Affûtage avant l'objectif";
    case "transition":
      return "Transition post-objectif";
    case "recovery":
      return "Récupération encadrée";
  }
}

function detailLevelForWeek(weekStart: string, now: string): "detailed" | "intent" | "macro" {
  const weekEnd = addDays(weekStart, 6);
  const detailedEnd = addDays(now, 6);
  const intentEnd = addDays(now, 13);
  const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd;
  if (overlaps(weekStart, weekEnd, now, detailedEnd)) return "detailed";
  if (overlaps(weekStart, weekEnd, now, intentEnd)) return "intent";
  return "macro";
}

export function buildMacroBlocks(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { blocks: PlanBlockDraft[]; weeks: PlanWeekDraft[]; traces: DecisionTrace[] } {
  const maxConsecutive = requireNonNull(
    ruleset.params.guardrails.max_consecutive_days_without_rest,
    "guardrails.max_consecutive_days_without_rest",
  );

  // AC14 — date cible déjà atteinte/dépassée : jamais de plan vide. Le pipeline construit un
  // horizon court de transition/récupération plutôt que de tenter une périodisation vers une
  // cible qui n'existe plus. L'orchestrateur assemble l'offre utilisateur (nouvel objectif OU
  // transition) à partir de la trace `objectiveEnd` émise ci-dessous ; le moteur pur garantit
  // seulement qu'un plan cohérent (blocs + semaines + séances) existe malgré tout.
  const objectiveAlreadyEnded = context.objective.targetDate !== null && diffDays(context.now, context.objective.targetDate) < 0;

  const rawTotalWeeks = objectiveAlreadyEnded
    ? MESO_BLOCK_WEEKS
    : context.objective.targetDate
      ? Math.max(MESO_BLOCK_WEEKS, Math.ceil(diffDays(context.now, context.objective.targetDate) / 7))
      : DEFAULT_HORIZON_WEEKS_WITHOUT_TARGET_DATE;
  const totalWeeks = Math.min(rawTotalWeeks, MAX_HORIZON_WEEKS);

  const numBlocks = Math.max(1, Math.ceil(totalWeeks / MESO_BLOCK_WEEKS));
  const horizonStartWeek = startOfIsoWeek(context.now);

  const blocks: PlanBlockDraft[] = [];
  const traces: DecisionTrace[] = [];

  if (objectiveAlreadyEnded) {
    traces.push(
      traceFactory.make({
        ruleId: RULE_IDS.objectiveEnd,
        ruleVersion: RULE_VERSION,
        category: "progression",
        isHardGuardrail: false,
        scope: "objective",
        scopeRefId: context.objective.id,
        scopeRefDate: context.objective.targetDate,
        conditionExpr: `now(${context.now}) > objective.target_date(${context.objective.targetDate})`,
        inputsUsed: [
          {
            source: "objectives",
            sourceId: context.objective.id,
            field: "target_date",
            value: context.objective.targetDate,
            observedOn: context.now,
          },
        ],
        output: { field: "objective_end_offer", before: null, after: "transition_or_new_objective", direction: "neutral" },
        severity: "info",
      }),
    );
  }

  for (let i = 0; i < numBlocks; i++) {
    const startDate = addWeeks(horizonStartWeek, i * MESO_BLOCK_WEEKS);
    const endDate = addDays(addWeeks(startDate, MESO_BLOCK_WEEKS), -1);
    const blockType = objectiveAlreadyEnded ? (i === 0 ? "transition" : "recovery") : blockTypeForIndex(i, numBlocks);

    const trace = traceFactory.make({
      ruleId: RULE_IDS.macroBlock,
      ruleVersion: RULE_VERSION,
      category: "progression",
      isHardGuardrail: false,
      scope: "block",
      scopeRefId: String(i),
      scopeRefDate: startDate,
      conditionExpr: `block ${i + 1}/${numBlocks}, periodization index=${(i / Math.max(1, numBlocks - 1)).toFixed(2)}`,
      inputsUsed: [
        {
          source: "objectives",
          sourceId: context.objective.id,
          field: "target_date",
          value: context.objective.targetDate,
          observedOn: context.now,
        },
      ],
      output: { field: "block_type", before: null, after: blockType, direction: "neutral" },
      severity: "info",
    });
    traces.push(trace);

    blocks.push({
      blockIndex: i,
      blockType,
      startDate,
      endDate,
      focus: focusForBlockType(blockType),
      targetLoadUnits: 0, // rempli à l'étape 6 (agrégation des semaines)
      traceIds: [trace.id],
    });
  }

  const horizonEnd = blocks[blocks.length - 1]!.endDate;

  const weeks: PlanWeekDraft[] = [];
  let weekStart = horizonStartWeek;
  let blockIdx = 0;
  while (weekStart <= horizonEnd) {
    while (blockIdx < blocks.length - 1 && weekStart > blocks[blockIdx]!.endDate) blockIdx++;
    weeks.push({
      weekStart,
      isoWeek: isoWeekLabel(weekStart),
      blockIndex: blockIdx,
      detailLevel: detailLevelForWeek(weekStart, context.now),
      isDeload: false,
      targetLoadUnits: 0, // rempli à l'étape 6
      plannedIntenseSessions: 0, // rempli à l'étape 9
      maxConsecutiveDaysWithoutRest: maxConsecutive,
      traceIds: [],
    });
    weekStart = addWeeks(weekStart, 1);
  }

  return { blocks, weeks, traces };
}
