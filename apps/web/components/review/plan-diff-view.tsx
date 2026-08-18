import type { PlanDiffView } from "@hybride/domain";

import { DiffItemRow } from "./diff-item-row";
import { FirstWeekNotice } from "./first-week-notice";

/**
 * `PlanDiffView` — composant de comparaison avant/après dédié (AC5, notes UX de la fiche : « pas
 * seulement un nouveau plan affiché brut »). `fromWeek = null` ⟹ `FirstWeekNotice`, jamais une
 * erreur.
 */
export function PlanDiffView({ diff }: { diff: PlanDiffView }) {
  return (
    <div className="flex flex-col gap-4" data-testid="plan-diff-view">
      <div>
        <h2 className="font-serif text-title text-foreground">Ta semaine est prête</h2>
        <p className="mt-1 text-small text-foreground-subtle">
          {diff.fromWeek ? `Semaine ${diff.fromWeek} → ${diff.toWeek}` : `Semaine ${diff.toWeek}`}
        </p>
      </div>

      <p className="text-body text-foreground-muted" data-testid="plan-diff-summary">
        {diff.summary.short}
      </p>

      {diff.fromWeek === null ? (
        <FirstWeekNotice />
      ) : diff.items.length === 0 ? (
        <p className="text-body text-foreground-muted" data-testid="plan-diff-no-changes">
          Rien n&apos;a changé cette semaine par rapport à la précédente.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="plan-diff-items">
          {diff.items.map((item, index) => (
            <DiffItemRow key={`${item.kind}-${item.targetDate ?? ""}-${index}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
