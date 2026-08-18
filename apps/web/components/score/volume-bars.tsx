import type { HybridScoreVolumeDayView } from "@hybride/domain";

const DAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * `S-volume-bars` — 7 colonnes (`09-design-feature2-notes.md` §4.3). Piste TOUJOURS rendue, même
 * un jour sans séance. Jour courant marqué deux fois (piste plus claire + initiale blanche 600) —
 * repère redondant, non chromatique.
 */
export function VolumeBars({ days }: { days: HybridScoreVolumeDayView[] }) {
  const max = Math.max(1, ...days.map((d) => d.loadUnits));
  const todayIso = new Date().toISOString().slice(0, 10);
  const summary = days.map((d) => `${d.date} : ${d.loadUnits > 0 ? `${d.loadUnits} unités` : "aucune séance"}`).join(", ");

  return (
    <div className="flex flex-col gap-2" role="img" aria-label={summary} data-testid="volume-bars">
      <div className="flex h-24 items-end justify-between gap-2">
        {days.map((day, index) => {
          const isToday = day.date === todayIso;
          const height = day.loadUnits > 0 ? Math.max(4, Math.round((96 * day.loadUnits) / max)) : 0;
          return (
            <div key={day.date} className="flex w-7 flex-col items-center gap-2" aria-hidden="true">
              <div className={`relative h-24 w-7 overflow-hidden rounded-full ${isToday ? "bg-border-strong" : "bg-surface-raised"}`}>
                {height > 0 ? <div className="absolute bottom-0 w-7 rounded-full bg-accent" style={{ height }} /> : null}
              </div>
              <span className={`text-caption ${isToday ? "font-semibold text-foreground" : "text-foreground-subtle"}`}>{DAY_INITIALS[index]}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 text-caption text-foreground-muted">
        <span>
          <span aria-hidden="true">↻</span> Synchronisé
        </span>
        <span>
          <span aria-hidden="true">✎</span> Déclaré
        </span>
      </div>
    </div>
  );
}
