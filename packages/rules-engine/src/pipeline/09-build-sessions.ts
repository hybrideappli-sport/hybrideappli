/**
 * Étape 9 — `buildSessions` (AC1, AC4, AC9, AC10).
 *
 * Construit les séances des 14 prochains jours SEULEMENT (ADR-004 §3) :
 * détail complet (`prescription`) sur J → J+6, intention (sans prescription)
 * sur J+7 → J+13. Le budget de charge de chaque semaine ISO (déjà calculé
 * à l'étape 6, garde-fous compris) est réparti sur ses jours d'entraînement.
 *
 * Simplifications documentées de `developer` (voir le rapport de fin de
 * lot) :
 *  - au plus UNE séance par jour (`order_in_day` toujours 1) ;
 *  - durée constante pour toutes les séances d'une même semaine ISO
 *    (`D = target_load_units / Σ poids`), ce qui garantit
 *    `Σ load_units ≈ target_load_units` par construction ;
 *  - la répartition fine des jours d'entraînement dans la semaine est
 *    "best effort" (`pickTrainingDays`) — la borne dure "jours consécutifs
 *    sans repos" n'est garantie qu'à l'étape 11 (`applyHardGuardrails`,
 *    terminale), qui seule voit le calendrier complet et peut détecter un
 *    dépassement à cheval sur deux semaines ISO.
 */

import type {
  AthleteSportSnapshot,
  DecisionTrace,
  PlanWeekDraft,
  PlannedSessionDraft,
  PlanningContext,
  Ruleset,
  SessionType,
} from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids.js";
import type { TraceFactory } from "../lib/trace.js";
import { addDays, diffDays } from "../lib/dates.js";
import { DISCIPLINE_FACTOR_BY_FAMILY, INTENSITY_FACTOR_BY_SESSION_TYPE, computeLoadUnits } from "../lib/load-units.js";
import { isIntenseSessionType } from "../lib/guardrail-helpers.js";
import type { SportAllocation } from "./07-distribute-across-sports.js";
import type { PainState } from "./02-resolve-pain-state.js";

const SESSION_TYPE_CYCLES: Record<AthleteSportSnapshot["family"], SessionType[]> = {
  endurance: ["endurance", "endurance", "tempo", "endurance", "interval", "long", "endurance"],
  strength: ["strength"],
  mixed: ["cross_training", "endurance", "strength", "cross_training"],
  skill: ["technique", "endurance"],
};

function pickTrainingDays(count: number, maxConsecutiveDaysWithoutRest: number): number[] {
  const cappedCount = Math.max(0, Math.min(count, Math.min(7, maxConsecutiveDaysWithoutRest)));
  if (cappedCount === 0) return [];
  const days = new Set<number>();
  for (let i = 0; i < cappedCount; i++) {
    const day = 1 + Math.round((i * 7) / cappedCount);
    days.add(Math.min(7, Math.max(1, day)));
  }
  // Complète si les arrondis ont produit des doublons (arrive pour certains ratios).
  let candidate = 1;
  while (days.size < cappedCount && candidate <= 7) {
    days.add(candidate);
    candidate++;
  }
  return Array.from(days).sort((a, b) => a - b);
}

function buildPrescription(sessionType: SessionType): PlannedSessionDraft["prescription"] {
  return {
    warmup: sessionType === "rest" ? "" : "10-15 min d'échauffement progressif",
    body: `Corps de séance : ${sessionType}`,
    cooldown: sessionType === "rest" ? "" : "5-10 min de retour au calme",
  };
}

interface BuildSessionsArgs {
  context: PlanningContext;
  ruleset: Ruleset;
  weeks: PlanWeekDraft[];
  allocations: SportAllocation[];
  painState: PainState;
  minDaysBetweenIntenseAndStrengthSameGroups: number;
  traceFactory: TraceFactory;
}

export function buildSessions(args: BuildSessionsArgs): { sessions: PlannedSessionDraft[]; traces: DecisionTrace[] } {
  const { context, weeks, allocations, painState, minDaysBetweenIntenseAndStrengthSameGroups, traceFactory } = args;

  const maxConsecutive = weeks[0]?.maxConsecutiveDaysWithoutRest ?? 6;
  const declaredSessions = context.profile.declaredWeeklySessions ?? 4;
  const availableWeekdays = context.availability.filter((a) => a.isAvailable).map((a) => a.weekday);
  const candidateWeekdays = availableWeekdays.length > 0 ? Array.from(new Set(availableWeekdays)).sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7];
  const trainingDayCount = Math.min(declaredSessions, candidateWeekdays.length) || Math.min(declaredSessions, 7);
  const trainingWeekdaysBase = pickTrainingDays(trainingDayCount, maxConsecutive);
  // N'utilise que les jours réellement déclarés disponibles, dans l'ordre choisi ci-dessus.
  const trainingWeekdays =
    availableWeekdays.length > 0 ? trainingWeekdaysBase.filter((d) => candidateWeekdays.includes(d)) : trainingWeekdaysBase;

  const sessions: PlannedSessionDraft[] = [];
  const traces: DecisionTrace[] = [];

  const sportOccurrenceCounters = new Map<string, number>();
  let allocationCursor = 0;
  const lastIntenseByFamily = new Map<string, { date: string; muscleGroups: PlannedSessionDraft["muscleGroups"] }>();

  const relevantWeeks = weeks.filter((w) => w.detailLevel !== "macro");

  for (const week of relevantWeeks) {
    // Jours candidats de CETTE semaine ISO, restreints à la fenêtre [now, now+13] (ADR-004 §3).
    const weekDates: string[] = [];
    for (const weekday of trainingWeekdays) {
      const date = addDays(week.weekStart, weekday - 1);
      const offset = diffDays(context.now, date);
      if (offset < 0 || offset > 13) continue;
      weekDates.push(date);
    }
    if (weekDates.length === 0) continue;
    weekDates.sort();

    if (allocations.length === 0) continue; // aucun sport pratiqué déclaré : rien à planifier

    // Choix du type de séance par jour (avant calcul de durée, pour connaître Σ poids).
    const planned = weekDates.map((date) => {
      const allocation = allocations[allocationCursor % allocations.length]!;
      allocationCursor++;
      const sport = allocation.sport;
      const occurrence = sportOccurrenceCounters.get(sport.sportId) ?? 0;
      sportOccurrenceCounters.set(sport.sportId, occurrence + 1);
      const cycle = SESSION_TYPE_CYCLES[sport.family];
      const sessionType = cycle[occurrence % cycle.length]!;
      return { date, sport, sessionType };
    });

    const totalWeight = planned.reduce((sum, p) => {
      const intensity = INTENSITY_FACTOR_BY_SESSION_TYPE[p.sessionType];
      return sum + intensity * DISCIPLINE_FACTOR_BY_FAMILY[p.sport.family];
    }, 0);
    const durationForWeek = totalWeight > 0 ? Math.max(20, Math.round(week.targetLoadUnits / totalWeight)) : 0;

    for (const { date, sport, sessionType: initialSessionType } of planned) {
      const offset = diffDays(context.now, date);
      const detailLevel: PlannedSessionDraft["detailLevel"] = offset <= 6 ? "detailed" : "intent";

      let sessionType = initialSessionType;
      let muscleGroups = sport.defaultMuscleGroups;
      let interferenceNote: string | null = null;
      const sessionTraces: DecisionTrace[] = [];

      // AC9 — zones bloquées (persistent/acute) : la séance est réorientée vers de la mobilité.
      const overlapsBlockedZone = muscleGroups.some((g) => painState.blockedMuscleGroups.has(g));
      if (overlapsBlockedZone) {
        const beforeType = sessionType;
        sessionType = "mobility";
        muscleGroups = muscleGroups.filter((g) => !painState.blockedMuscleGroups.has(g));
        sessionTraces.push(
          traceFactory.make({
            ruleId: RULE_IDS.painZoneExcluded,
            ruleVersion: RULE_VERSION,
            category: "pain",
            isHardGuardrail: true,
            scope: "session",
            scopeRefId: null,
            scopeRefDate: date,
            conditionExpr: "session muscle groups overlap a blocked pain zone",
            inputsUsed: [],
            output: { field: "session_type", before: beforeType, after: sessionType, direction: "neutral" },
            severity: "warning",
          }),
        );
      }

      // AC10 — interférence : espacer une séance de force des séances intenses sur les mêmes groupes.
      const isIntense = isIntenseSessionType(sessionType);
      if (isIntense) {
        lastIntenseByFamily.set(sport.family, { date, muscleGroups });
      }
      if (sessionType === "strength") {
        for (const { date: intenseDate, muscleGroups: intenseMuscleGroups } of lastIntenseByFamily.values()) {
          const gapDays = diffDays(intenseDate, date);
          if (gapDays >= 0 && gapDays < minDaysBetweenIntenseAndStrengthSameGroups) {
            const sharesGroups = muscleGroups.some((g) => intenseMuscleGroups.includes(g));
            if (sharesGroups) {
              interferenceNote = `Séance allégée pour respecter l'espacement de récupération avec une séance intense récente (${gapDays}j).`;
              break;
            }
          }
        }
      }

      const reducedDuration = interferenceNote !== null ? Math.round(durationForWeek * 0.7) : durationForWeek;
      const loadUnits = computeLoadUnits(reducedDuration, sessionType, sport.family);

      const sessionTrace = traceFactory.make({
        ruleId: interferenceNote !== null ? RULE_IDS.interferenceSpacing : RULE_IDS.sessionBuilt,
        ruleVersion: RULE_VERSION,
        category: interferenceNote !== null ? "interference" : "progression",
        isHardGuardrail: false,
        scope: "session",
        scopeRefId: null,
        scopeRefDate: date,
        conditionExpr:
          interferenceNote !== null
            ? "strength session within interference window of a recent intense session, same muscle groups"
            : `week budget(${week.targetLoadUnits}) distributed over ${weekDates.length} session(s)`,
        inputsUsed: [
          { source: "athlete_sports", sourceId: sport.sportId, field: "code", value: sport.code, observedOn: context.now },
        ],
        output: { field: "load_units", before: null, after: loadUnits, direction: "neutral" },
        severity: "info",
      });

      sessions.push({
        scheduledDate: date,
        slot: "unspecified",
        orderInDay: 1,
        sportCode: sport.code,
        sessionType,
        detailLevel,
        durationMin: reducedDuration,
        loadUnits,
        intensityZone: isIntense ? "high" : sessionType === "rest" ? null : "moderate",
        prescription: detailLevel === "detailed" ? buildPrescription(sessionType) : null,
        muscleGroups,
        interferenceNote,
        isIntense,
        traceIds: [sessionTrace.id, ...sessionTraces.map((t) => t.id)],
      });

      traces.push(sessionTrace, ...sessionTraces);
    }
  }

  return { sessions, traces };
}
