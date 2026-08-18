import type { HybridScoreSplitView } from "@hybride/domain";

/**
 * `S-split-card` — répartition par discipline (`09-design-feature2-notes.md` §4.4). Cas « une
 * seule discipline » traité explicitement : la ligne unique à 100 % est complétée par une phrase,
 * jamais laissée seule à parler.
 */
export function DisciplineSplit({ split }: { split: HybridScoreSplitView }) {
  return (
    <div className="flex flex-col gap-3" data-testid="discipline-split">
      {split.items.map((item) => (
        <div key={item.sportCode ?? item.label} className="flex items-center gap-3" role="progressbar" aria-label={`${item.label} : ${item.sharePct} %`} aria-valuenow={item.sharePct} aria-valuemin={0} aria-valuemax={100}>
          <span className="w-24 shrink-0 text-small text-foreground-muted">{item.label}</span>
          <span className="h-1 flex-1 rounded-full bg-border-strong" aria-hidden="true">
            <span className="block h-1 rounded-full bg-accent" style={{ width: `${item.sharePct}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right text-small text-foreground">{item.sharePct} %</span>
        </div>
      ))}
      {split.items.length === 1 ? (
        <p className="text-small text-foreground-muted">Une seule discipline pour l&apos;instant — le score hybride prend tout son sens à partir de deux.</p>
      ) : null}
    </div>
  );
}
