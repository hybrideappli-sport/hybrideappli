import type { TodaySessionView } from "@hybride/domain";

import { PlanningSessionCard } from "./session-card";

const FRENCH_WEEKDAYS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const jsDay = d.getUTCDay();
  return `${FRENCH_WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1]} ${d.getUTCDate()}`;
}

function shortDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const jsDay = d.getUTCDay();
  return ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"][jsDay === 0 ? 6 : jsDay - 1]!;
}

/** `P-day-group` — une ligne par jour, Lun → Dim (`10-design-feature3-notes.md` §1.3). */
export function PlanningDayGroup({ date, sessions }: { date: string; sessions: TodaySessionView[] }) {
  return (
    <section aria-labelledby={`day-${date}`} className="flex flex-col gap-3" data-testid="planning-day-group">
      <h2 id={`day-${date}`} className="text-label text-foreground-subtle">
        {dayLabel(date)}
      </h2>
      {sessions.length === 0 ? (
        <p className="text-small text-foreground-subtle" data-testid="planning-day-rest">
          Repos
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((session) => (
            <PlanningSessionCard key={session.id} dayLabel={shortDayLabel(date)} session={session} />
          ))}
        </ul>
      )}
    </section>
  );
}
