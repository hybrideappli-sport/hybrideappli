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

/**
 * US-03 — heure locale `HH:MM`, minute près (`planning.min_lead_time_min`, ADR-016 §7). Distinct
 * de `localClockParts()` (`lib/orchestration/local-clock.ts`), qui ne résout l'heure locale qu'à
 * l'heure entière — suffisant pour l'enrôlement de jobs, pas pour comparer un créneau précis.
 */
export function nowTimeInTimezone(timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const value = formatter.format(new Date());
  // `Intl` peut rendre "24:xx" à minuit selon l'environnement (`hour12: false`) — normalisé.
  const [h, m] = value.split(":");
  const hour = Number.parseInt(h ?? "0", 10) % 24;
  return `${String(hour).padStart(2, "0")}:${m}`;
}

/** `{ date, time }` résolus ensemble — évite deux appels d'horloge légèrement désynchronisés. */
export function nowPartsInTimezone(timezone: string): { date: string; time: string } {
  return { date: todayInTimezone(timezone), time: nowTimeInTimezone(timezone) };
}
