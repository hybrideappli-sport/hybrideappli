/**
 * Arithmétique de dates PURE.
 *
 * Toutes les fonctions ci-dessous opèrent uniquement sur des chaînes ISO
 * (`YYYY-MM-DD`) reçues en argument. Aucune ne lit l'horloge système
 * (`Date.now`, `new Date()` sans argument) — ADR-002. La date "aujourd'hui"
 * (`context.now`) est TOUJOURS une date locale déjà résolue par l'appelant
 * (ADR-008 : "date locale utilisateur"), le moteur fait donc une arithmétique
 * calendaire simple, sans conversion de fuseau.
 *
 * `Date` est utilisé uniquement comme calculatrice calendaire, toujours
 * construit à partir d'une chaîne ISO explicite fixée à minuit UTC — jamais
 * à partir de l'horloge courante.
 */

function toUtcDate(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Date ISO invalide : "${iso}"`);
  }
  return d;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

/** Nombre de jours entre `a` et `b` (positif si `b` est après `a`). */
export function diffDays(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / msPerDay);
}

/** 1 = lundi ... 7 = dimanche (ISO 8601), pas `Date#getDay()` (0 = dimanche). */
export function isoWeekday(iso: string): number {
  const jsDay = toUtcDate(iso).getUTCDay(); // 0 = dimanche
  return jsDay === 0 ? 7 : jsDay;
}

/** Le lundi de la semaine ISO contenant `iso`. */
export function startOfIsoWeek(iso: string): string {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

/** Libellé `'2026-W32'` (semaine ISO 8601). */
export function isoWeekLabel(iso: string): string {
  const date = toUtcDate(startOfIsoWeek(iso));
  // Jeudi de la semaine ISO détermine l'année ISO (règle ISO 8601 standard).
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekMonday = new Date(jan4);
  firstWeekMonday.setUTCDate(jan4.getUTCDate() - (isoWeekday(toIso(jan4)) - 1));
  const weekNumber = Math.round((thursday.getTime() - firstWeekMonday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${isoYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

export function minIso(a: string, b: string): string {
  return a < b ? a : b;
}
