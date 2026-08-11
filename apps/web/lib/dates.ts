/**
 * Petite arithmétique de dates ISO (`YYYY-MM-DD`), côté `apps/web` — jamais lue depuis l'horloge
 * système ici non plus (les appelants passent toujours une date déjà résolue, `todayInTimezone()`).
 * Duplique volontairement `packages/rules-engine/src/lib/dates.ts` (non exporté par le barrel du
 * moteur, ADR-003 : ce module n'a pas vocation à devenir une dépendance publique du moteur pur)
 * plutôt que d'élargir la surface exportée d'un package qui doit rester minimal.
 */

function toUtcDate(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Date ISO invalide : "${iso}"`);
  }
  return d;
}

export function addDaysIso(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entre `a` et `b` (positif si `b` est après `a`). */
export function diffDaysIso(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / msPerDay);
}

/** 1 = lundi ... 7 = dimanche (ISO 8601), pas `Date#getDay()` (0 = dimanche). */
function isoWeekdayOf(iso: string): number {
  const jsDay = toUtcDate(iso).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** Le lundi de la semaine ISO contenant `iso`. */
export function startOfIsoWeekIso(iso: string): string {
  return addDaysIso(iso, -(isoWeekdayOf(iso) - 1));
}

/**
 * Libellé `'2026-W32'` (semaine ISO 8601) — duplique volontairement
 * `packages/rules-engine/src/lib/dates.ts::isoWeekLabel` (non exporté par le barrel du moteur,
 * même rationale que le reste de ce fichier, voir son en-tête). Nécessaire à `runWeeklyReview()`
 * (Lot L5, `job_queue.idempotency_key = 'weekly_review:{user}:{isoWeek}'`, ADR-011 §2).
 */
export function isoWeekLabel(iso: string): string {
  const monday = startOfIsoWeekIso(iso);
  const mondayDate = toUtcDate(monday);
  const thursday = new Date(mondayDate);
  thursday.setUTCDate(mondayDate.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Iso = jan4.toISOString().slice(0, 10);
  const firstWeekMonday = toUtcDate(startOfIsoWeekIso(jan4Iso));
  const weekNumber = Math.round((thursday.getTime() - firstWeekMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}
