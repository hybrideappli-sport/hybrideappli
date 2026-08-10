/**
 * `diffPlanVersions` — AC5, ADR-005 §4.
 *
 * Fonction pure : compare deux `PlanSnapshot` déjà calculés (`from` la
 * semaine de référence précédente, `to` la nouvelle) et produit un diff
 * lisible. `from = null` est le cas explicite "première semaine, rien à
 * comparer" (ADR-005 : "à ne pas laisser en erreur").
 *
 * `decisionTraceIds` par item est lu directement sur les entités du
 * snapshot `to` (`traceIds`, voir `@hybride/domain/plan-draft.ts`) : le
 * snapshot est auto-suffisant (ADR-005 §2), aucune requête supplémentaire
 * n'est nécessaire pour l'auditabilité du diff.
 */

import type {
  NutritionDayDraft,
  PlanBlockDraft,
  PlanDiff,
  PlanDiffItem,
  PlanSnapshot,
  PlanWeekDraft,
  PlannedSessionDraft,
} from "@hybride/domain";

function directionOf(before: number, after: number): "increase" | "decrease" | "neutral" {
  if (after > before) return "increase";
  if (after < before) return "decrease";
  return "neutral";
}

function indexBy<T, K>(list: T[], keyFn: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>();
  for (const item of list) map.set(keyFn(item), item);
  return map;
}

function diffBlocks(from: PlanBlockDraft[], to: PlanBlockDraft[]): PlanDiffItem[] {
  const fromByIndex = indexBy(from, (b) => b.blockIndex);
  const items: PlanDiffItem[] = [];
  for (const afterBlock of to) {
    const beforeBlock = fromByIndex.get(afterBlock.blockIndex);
    if (!beforeBlock) continue; // un bloc apparaissant plus loin dans l'horizon n'est pas un "changement"
    if (beforeBlock.blockType !== afterBlock.blockType || beforeBlock.targetLoadUnits !== afterBlock.targetLoadUnits) {
      items.push({
        kind: "block_changed",
        scope: "block",
        targetDate: afterBlock.startDate,
        before: { blockType: beforeBlock.blockType, targetLoadUnits: beforeBlock.targetLoadUnits },
        after: { blockType: afterBlock.blockType, targetLoadUnits: afterBlock.targetLoadUnits },
        direction: directionOf(beforeBlock.targetLoadUnits, afterBlock.targetLoadUnits),
        decisionTraceIds: afterBlock.traceIds,
      });
    }
  }
  return items;
}

function diffWeeks(from: PlanWeekDraft[], to: PlanWeekDraft[]): PlanDiffItem[] {
  const fromByWeek = indexBy(from, (w) => w.weekStart);
  const items: PlanDiffItem[] = [];
  for (const afterWeek of to) {
    const beforeWeek = fromByWeek.get(afterWeek.weekStart);
    if (!beforeWeek) continue;
    if (!beforeWeek.isDeload && afterWeek.isDeload) {
      items.push({
        kind: "deload_inserted",
        scope: "week",
        targetDate: afterWeek.weekStart,
        before: { targetLoadUnits: beforeWeek.targetLoadUnits },
        after: { targetLoadUnits: afterWeek.targetLoadUnits },
        direction: "decrease",
        decisionTraceIds: afterWeek.traceIds,
      });
      continue;
    }
    if (beforeWeek.targetLoadUnits !== afterWeek.targetLoadUnits) {
      items.push({
        kind: "week_load_changed",
        scope: "week",
        targetDate: afterWeek.weekStart,
        before: { targetLoadUnits: beforeWeek.targetLoadUnits },
        after: { targetLoadUnits: afterWeek.targetLoadUnits },
        direction: directionOf(beforeWeek.targetLoadUnits, afterWeek.targetLoadUnits),
        decisionTraceIds: afterWeek.traceIds,
      });
    }
  }
  return items;
}

function sessionKey(session: PlannedSessionDraft): string {
  return `${session.scheduledDate}#${session.orderInDay}`;
}

function diffSessions(from: PlannedSessionDraft[], to: PlannedSessionDraft[]): PlanDiffItem[] {
  const fromByKey = indexBy(from, sessionKey);
  const toByKey = indexBy(to, sessionKey);
  const items: PlanDiffItem[] = [];

  for (const afterSession of to) {
    const key = sessionKey(afterSession);
    const beforeSession = fromByKey.get(key);
    if (!beforeSession) {
      items.push({
        kind: "session_added",
        scope: "day",
        targetDate: afterSession.scheduledDate,
        before: null,
        after: { sessionType: afterSession.sessionType, loadUnits: afterSession.loadUnits },
        direction: "increase",
        decisionTraceIds: afterSession.traceIds,
      });
      continue;
    }
    if (beforeSession.loadUnits !== afterSession.loadUnits || beforeSession.sessionType !== afterSession.sessionType) {
      items.push({
        kind: "session_modified",
        scope: "day",
        targetDate: afterSession.scheduledDate,
        before: { sessionType: beforeSession.sessionType, loadUnits: beforeSession.loadUnits },
        after: { sessionType: afterSession.sessionType, loadUnits: afterSession.loadUnits },
        direction: directionOf(beforeSession.loadUnits, afterSession.loadUnits),
        decisionTraceIds: afterSession.traceIds,
      });
    }
  }

  for (const beforeSession of from) {
    const key = sessionKey(beforeSession);
    if (!toByKey.has(key)) {
      items.push({
        kind: "session_removed",
        scope: "day",
        targetDate: beforeSession.scheduledDate,
        before: { sessionType: beforeSession.sessionType, loadUnits: beforeSession.loadUnits },
        after: null,
        direction: "decrease",
        decisionTraceIds: beforeSession.traceIds,
      });
    }
  }

  return items;
}

function diffNutritionDays(from: NutritionDayDraft[], to: NutritionDayDraft[]): PlanDiffItem[] {
  const fromByDate = indexBy(from, (n) => n.date);
  const items: PlanDiffItem[] = [];
  for (const afterDay of to) {
    const beforeDay = fromByDate.get(afterDay.date);
    if (!beforeDay) continue;
    if (beforeDay.kcalTarget !== afterDay.kcalTarget) {
      items.push({
        kind: "nutrition_target_changed",
        scope: "day",
        targetDate: afterDay.date,
        before: { kcalTarget: beforeDay.kcalTarget },
        after: { kcalTarget: afterDay.kcalTarget },
        direction: directionOf(beforeDay.kcalTarget, afterDay.kcalTarget),
        decisionTraceIds: afterDay.traceIds,
      });
    }
  }
  return items;
}

export function diffPlanVersions(from: PlanSnapshot | null, to: PlanSnapshot): PlanDiff {
  const toWeek = to.weeks.find((w) => w.detailLevel === "detailed")?.isoWeek ?? to.weeks[0]?.isoWeek ?? "";

  if (from === null) {
    return { fromWeek: null, toWeek, items: [] };
  }

  const fromWeek = from.weeks.find((w) => w.detailLevel === "detailed")?.isoWeek ?? from.weeks[0]?.isoWeek ?? null;

  const items: PlanDiffItem[] = [
    ...diffBlocks(from.blocks, to.blocks),
    ...diffWeeks(from.weeks, to.weeks),
    ...diffSessions(from.sessions, to.sessions),
    ...diffNutritionDays(from.nutritionDays, to.nutritionDays),
  ];

  return { fromWeek, toWeek, items };
}
