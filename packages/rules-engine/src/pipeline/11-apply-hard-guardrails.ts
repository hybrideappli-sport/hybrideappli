/**
 * Étape 11 — `applyHardGuardrails` (AC8) — TERMINALE.
 *
 * "Les garde-fous ne sont pas des paramètres d'entrée des étapes
 * précédentes mais un filtre final qui écrase le résultat" (`08-architecture.md`
 * §4.2). Les étapes 1-9 appliquent déjà les garde-fous de façon proactive ;
 * cette étape est le filet de sécurité qui les RE-VÉRIFIE sur le résultat
 * complet et les fait respecter QUOI QU'IL ARRIVE, y compris contre un bug
 * amont — c'est cette étape, et elle seule, que `guardrails.property.test.ts`
 * doit pouvoir faire confiance aveuglément.
 *
 * Quatre bornes vérifiées ici, dans cet ordre :
 *  1. plafond de progression de VOLUME hebdomadaire (durée totale) ;
 *  2. réduction effective des semaines de décharge ;
 *  3. plafond de séances intenses par semaine ;
 *  4. maximum de jours consécutifs sans repos (calendrier complet, à cheval
 *     sur plusieurs semaines ISO si nécessaire — la seule étape qui voit
 *     l'intégralité du calendrier des 14 jours).
 */

import type { DecisionTrace, GuardrailHit, PlanWeekDraft, PlannedSessionDraft, Ruleset } from "@hybride/domain";
import { RULE_IDS, RULE_VERSION } from "../rule-ids.js";
import type { TraceFactory } from "../lib/trace.js";
import { requireNonNull } from "../lib/require-non-null.js";
import { computeLoadUnits } from "../lib/load-units.js";
import { diffDays, startOfIsoWeek } from "../lib/dates.js";
import { isIntenseSessionType } from "../lib/guardrail-helpers.js";

export function applyHardGuardrails(
  weeks: PlanWeekDraft[],
  sessions: PlannedSessionDraft[],
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { weeks: PlanWeekDraft[]; sessions: PlannedSessionDraft[]; traces: DecisionTrace[]; guardrailsApplied: GuardrailHit[] } {
  const volumeCapPct = requireNonNull(ruleset.params.guardrails.weekly_volume_progression_cap_pct, "guardrails.weekly_volume_progression_cap_pct");
  const deloadReductionPct = requireNonNull(ruleset.params.guardrails.deload_volume_reduction_pct, "guardrails.deload_volume_reduction_pct");
  const maxIntensePerWeek = requireNonNull(ruleset.params.guardrails.max_intense_sessions_per_week, "guardrails.max_intense_sessions_per_week");
  const maxConsecutive = requireNonNull(ruleset.params.guardrails.max_consecutive_days_without_rest, "guardrails.max_consecutive_days_without_rest");

  const traces: DecisionTrace[] = [];
  const guardrailsApplied: GuardrailHit[] = [];
  let workingSessions = sessions.map((s) => ({ ...s }));
  const workingWeeks = weeks.map((w) => ({ ...w }));

  // -- 1 & 2. Plafond de progression de VOLUME + réduction effective en décharge ------------
  const weeksWithSessions = workingWeeks
    .filter((w) => workingSessions.some((s) => startOfIsoWeek(s.scheduledDate) === w.weekStart))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));

  function totalDurationForWeek(weekStart: string): number {
    return workingSessions
      .filter((s) => startOfIsoWeek(s.scheduledDate) === weekStart)
      .reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
  }

  for (let i = 1; i < weeksWithSessions.length; i++) {
    const week = weeksWithSessions[i]!;
    const previousWeek = weeksWithSessions[i - 1]!;
    const currentDuration = totalDurationForWeek(week.weekStart);
    const previousDuration = totalDurationForWeek(previousWeek.weekStart);
    if (previousDuration <= 0 || currentDuration <= 0) continue;

    const allowedMultiplier = week.isDeload ? 1 - deloadReductionPct / 100 : 1 + volumeCapPct / 100;
    const allowedDuration = previousDuration * allowedMultiplier;

    const violates = currentDuration > allowedDuration + 1e-6;

    if (violates) {
      const scale = allowedDuration / currentDuration;
      workingSessions = workingSessions.map((s) => {
        if (startOfIsoWeek(s.scheduledDate) !== week.weekStart) return s;
        const newDuration = Math.max(0, Math.round((s.durationMin ?? 0) * scale));
        return { ...s, durationMin: newDuration, loadUnits: computeLoadUnits(newDuration, s.sessionType, null) };
      });

      const trace = traceFactory.make({
        ruleId: week.isDeload ? RULE_IDS.deloadInserted : RULE_IDS.weeklyLoadCapApplied,
        ruleVersion: RULE_VERSION,
        category: "guardrail",
        isHardGuardrail: true,
        scope: "week",
        scopeRefId: null,
        scopeRefDate: week.weekStart,
        conditionExpr: week.isDeload
          ? `total duration(${currentDuration}) exceeds deload target ${previousDuration} × (1 − ${deloadReductionPct}%)`
          : `total duration(${currentDuration}) exceeds weekly_volume_progression_cap_pct(${volumeCapPct}%) applied to previous week(${previousDuration})`,
        inputsUsed: [],
        output: { field: "week_total_duration_min", before: currentDuration, after: Math.round(allowedDuration), direction: "decrease" },
        severity: "critical",
      });
      traces.push(trace);
      guardrailsApplied.push({
        ruleId: trace.ruleId,
        guardrail: week.isDeload ? "mandatory_deload" : "weekly_volume_progression_cap",
        scope: "week",
        scopeRefDate: week.weekStart,
        before: currentDuration,
        after: Math.round(allowedDuration),
        traceId: trace.id,
      });
    }
  }

  // -- 3. Plafond de séances intenses par semaine --------------------------------------------
  const weekStartsInUse = Array.from(new Set(workingSessions.map((s) => startOfIsoWeek(s.scheduledDate))));
  for (const weekStart of weekStartsInUse) {
    const intenseSessions = workingSessions
      .filter((s) => startOfIsoWeek(s.scheduledDate) === weekStart && isIntenseSessionType(s.sessionType))
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1)); // plus récentes d'abord

    if (intenseSessions.length <= maxIntensePerWeek) continue;

    const excess = intenseSessions.slice(0, intenseSessions.length - maxIntensePerWeek);
    for (const excessSession of excess) {
      const idx = workingSessions.findIndex((s) => s.scheduledDate === excessSession.scheduledDate && s.orderInDay === excessSession.orderInDay);
      if (idx === -1) continue;
      const before = workingSessions[idx]!;
      const newDuration = before.durationMin ?? 0;
      const newLoad = computeLoadUnits(newDuration, "endurance", null);

      const trace = traceFactory.make({
        ruleId: RULE_IDS.intenseSessionCapApplied,
        ruleVersion: RULE_VERSION,
        category: "guardrail",
        isHardGuardrail: true,
        scope: "session",
        scopeRefId: null,
        scopeRefDate: before.scheduledDate,
        conditionExpr: `intense sessions this week(${intenseSessions.length}) > max_intense_sessions_per_week(${maxIntensePerWeek})`,
        inputsUsed: [],
        output: { field: "session_type", before: before.sessionType, after: "endurance", direction: "decrease" },
        severity: "warning",
      });
      traces.push(trace);
      guardrailsApplied.push({
        ruleId: trace.ruleId,
        guardrail: "max_intense_sessions_per_week",
        scope: "session",
        scopeRefDate: before.scheduledDate,
        before: before.sessionType,
        after: "endurance",
        traceId: trace.id,
      });

      workingSessions[idx] = {
        ...before,
        sessionType: "endurance",
        isIntense: false,
        loadUnits: newLoad,
        traceIds: [...before.traceIds, trace.id],
      };
    }
  }

  // -- 4. Maximum de jours consécutifs sans repos (calendrier complet) -----------------------
  const sortedDates = Array.from(new Set(workingSessions.map((s) => s.scheduledDate))).sort();
  let runStart = 0;
  const datesToDrop = new Set<string>();
  for (let i = 1; i <= sortedDates.length; i++) {
    const brokeRun = i === sortedDates.length || diffDays(sortedDates[i - 1]!, sortedDates[i]!) > 1;
    if (brokeRun) {
      const runLength = i - runStart;
      if (runLength > maxConsecutive) {
        for (let j = runStart + maxConsecutive; j < i; j++) datesToDrop.add(sortedDates[j]!);
      }
      runStart = i;
    }
  }

  if (datesToDrop.size > 0) {
    for (const date of datesToDrop) {
      const trace = traceFactory.make({
        ruleId: RULE_IDS.restDayInserted,
        ruleVersion: RULE_VERSION,
        category: "guardrail",
        isHardGuardrail: true,
        scope: "session",
        scopeRefId: null,
        scopeRefDate: date,
        conditionExpr: `consecutive training days without rest > max_consecutive_days_without_rest(${maxConsecutive})`,
        inputsUsed: [],
        output: { field: "session_removed", before: 1, after: 0, direction: "decrease" },
        severity: "critical",
      });
      traces.push(trace);
      guardrailsApplied.push({
        ruleId: trace.ruleId,
        guardrail: "max_consecutive_days_without_rest",
        scope: "session",
        scopeRefDate: date,
        before: 1,
        after: 0,
        traceId: trace.id,
      });
    }
    workingSessions = workingSessions.filter((s) => !datesToDrop.has(s.scheduledDate));
  }

  // Recalcule `plannedIntenseSessions` par semaine après tous les ajustements ci-dessus.
  const finalWeeks = workingWeeks.map((week) => {
    const count = workingSessions.filter((s) => startOfIsoWeek(s.scheduledDate) === week.weekStart && s.isIntense).length;
    return weekStartsInUse.includes(week.weekStart) ? { ...week, plannedIntenseSessions: count } : week;
  });

  return { weeks: finalWeeks, sessions: workingSessions, traces, guardrailsApplied };
}
