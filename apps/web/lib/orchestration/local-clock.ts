/**
 * Heure/jour LOCAL d'un fuseau donné — ADR-011 §1 : « le cron horaire enrôle les utilisateurs
 * dont l'heure locale correspond au créneau cible ». Seul point de lecture de l'horloge système
 * autorisé pour cet usage (`08-architecture.md` §12, R9 : jamais de date serveur implicite pour
 * DÉCIDER quoi que ce soit côté métier — ici on ne fait que RÉSOUDRE l'heure locale de chaque
 * utilisateur pour une décision d'ENRÔLEMENT, pas pour calculer une valeur du plan).
 */
export interface LocalClockParts {
  /** Date locale `YYYY-MM-DD`. */
  date: string;
  /** 1 = lundi … 7 = dimanche (ISO 8601), jamais `Date#getDay()` (0 = dimanche). */
  isoWeekday: number;
  /** Heure locale 0-23. */
  hour: number;
}

const WEEKDAY_MAP: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localClockParts(timezone: string, now: Date = new Date()): LocalClockParts {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false });

  const date = dateFormatter.format(now);
  const weekdayLabel = weekdayFormatter.format(now);
  // `Intl` peut rendre "24" à minuit selon l'environnement (`hour12: false`) — normalisé à 0.
  const hour = Number.parseInt(hourFormatter.format(now), 10) % 24;

  return { date, isoWeekday: WEEKDAY_MAP[weekdayLabel] ?? 1, hour };
}
