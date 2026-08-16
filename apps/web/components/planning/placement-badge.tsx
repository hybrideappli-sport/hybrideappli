import type { PlacementStatus } from "@hybride/domain";

/**
 * `PlacementBadge` — pills outline warning (`10-design-feature3-notes.md` §1.5-§1.6, §5). La
 * couleur n'est JAMAIS seule porteuse : le libellé texte est la seule information réellement
 * transmise, la teinte orange n'ajoute qu'un renfort visuel (charte §5, accessibilité).
 */
const BADGE_CONFIG: Partial<Record<PlacementStatus, string>> = {
  moved: "DÉPLACÉE",
  cancelled_week: "ANNULÉE CETTE SEMAINE",
};

export function PlacementBadge({ status }: { status: PlacementStatus }) {
  const label = BADGE_CONFIG[status];
  if (!label) return null;
  return (
    <span className="text-label rounded-full border border-warning px-2.5 py-1 text-warning" data-testid="placement-badge">
      {label}
    </span>
  );
}

/** État (d) « Non réalisée » (amendement ADR-017 §8-§9, `11-design-notes.md` §3.4) — prime sur (b). */
export function NotDoneBadge() {
  return (
    <span className="text-label rounded-full border border-warning px-2.5 py-1 text-warning" data-testid="placement-badge-not-done">
      NON RÉALISÉE
    </span>
  );
}
