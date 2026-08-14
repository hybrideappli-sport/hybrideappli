import type { PlanDiffItemView } from "@hybride/domain";

import { ExplanationInline } from "@/components/coach/explanation-inline";

const KIND_LABELS: Record<PlanDiffItemView["kind"], string> = {
  session_added: "Séance ajoutée",
  session_removed: "Séance retirée",
  session_modified: "Séance modifiée",
  week_load_changed: "Charge de la semaine modifiée",
  block_changed: "Bloc modifié",
  nutrition_target_changed: "Cibles nutrition modifiées",
  deload_inserted: "Semaine de décharge",
  zone_paused: "Zone mise en pause",
};

const DIRECTION_ARROW: Record<PlanDiffItemView["direction"], string> = {
  increase: "↑",
  decrease: "↓",
  neutral: "→",
};

/** `DiffItemRow` — un item du diff hebdomadaire, direction ↑/↓ + explication (AC5, plan §1.6). */
export function DiffItemRow({ item }: { item: PlanDiffItemView }) {
  return (
    <li className="rounded-md bg-surface-raised p-3" data-testid="diff-item-row" data-direction={item.direction}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-strong font-semibold text-foreground">
          <span aria-hidden className="mr-1">
            {DIRECTION_ARROW[item.direction]}
          </span>
          {KIND_LABELS[item.kind]}
        </span>
        {item.targetDate ? <span className="text-caption text-foreground-subtle">{item.targetDate}</span> : null}
      </div>
      {item.explanation ? (
        <div className="mt-1">
          <ExplanationInline short={item.explanation.short} explanationId={item.explanation.explanationId} />
        </div>
      ) : null}
    </li>
  );
}
