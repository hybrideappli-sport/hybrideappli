/**
 * `evaluateFreeAccess` — AC13, ADR-008.
 *
 * Ne stocke rien : calcule le droit d'accès à partir du même journal
 * d'événements (`free_access_events`), quelle que soit la stratégie de
 * fenêtre (`fixed_week` ou `rolling_7d`) — ADR-008 §3.
 */

import type { FreeAccessEvent, FreeAccessParamsInput, FreeAccessResult } from "@hybride/domain";
import { addDays, startOfIsoWeek } from "./lib/dates";

function computePeriod(now: string, strategy: FreeAccessParamsInput["windowStrategy"]) {
  if (strategy === "fixed_week") {
    const periodStart = startOfIsoWeek(now);
    const periodEnd = addDays(periodStart, 6);
    const resetsAt = addDays(periodEnd, 1);
    return { periodStart, periodEnd, resetsAt };
  }
  // rolling_7d : fenêtre glissante des 7 derniers jours, `now` inclus.
  const periodStart = addDays(now, -6);
  const periodEnd = now;
  const resetsAt = addDays(now, 1);
  return { periodStart, periodEnd, resetsAt };
}

export function evaluateFreeAccess(
  events: FreeAccessEvent[],
  now: string,
  params: FreeAccessParamsInput,
): FreeAccessResult {
  const { periodStart, periodEnd, resetsAt } = computePeriod(now, params.windowStrategy);
  const inPeriod = events.filter((e) => e.accessedOn >= periodStart && e.accessedOn <= periodEnd);
  const used = inPeriod.length;
  const alreadyAccessedToday = inPeriod.some((e) => e.accessedOn === now);
  const remaining = Math.max(0, params.accessesPerPeriod - used);
  const allowed = alreadyAccessedToday || remaining > 0;

  return { allowed, used, remaining, periodStart, periodEnd, resetsAt };
}
