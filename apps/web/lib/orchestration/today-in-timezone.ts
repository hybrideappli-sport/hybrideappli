/**
 * Date du jour dans un fuseau donné, au format ISO `YYYY-MM-DD` — jamais une date serveur
 * implicite (`08-architecture.md` §12, R9 : « jamais de date serveur implicite »).
 * `profiles.timezone` est la source unique (ADR-008, ADR-011) ; `Europe/Paris` par défaut (H8).
 */
export function todayInTimezone(timezone: string): string {
  // Locale `en-CA` : seule locale native dont le format court est déjà `YYYY-MM-DD`.
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date());
}
