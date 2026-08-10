/**
 * `WeeklyReviewBadge` — AC5 : garantie de repli si la notification push/e-mail n'arrive pas
 * (`08-architecture.md` §7 : « badge persistant dans le Dashboard, seule garantie réellement fiable
 * compte tenu des limites du Web Push sur iOS »). Le job de révision hebdomadaire (`plan_diffs`,
 * `notifications`) est construit au Lot L5 — ce badge reste volontairement informatif/statique à ce
 * lot, pas encore branché sur un état réel de notification non lue.
 */
export function WeeklyReviewBadge() {
  return (
    <p className="text-xs text-neutral-400" data-testid="weekly-review-badge">
      Ta révision hebdomadaire arrive chaque dimanche soir, avec ce qui change et pourquoi.
    </p>
  );
}
