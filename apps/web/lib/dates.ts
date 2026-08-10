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
