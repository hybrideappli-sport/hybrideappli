import { ExplanationSheet } from "./explanation-sheet";

/**
 * `ExplanationInline` — AC1 : `short_text` affiché par défaut sur chaque recommandation, avec un
 * lien « en savoir plus » (`ExplanationSheet`, AC5) quand un `explanationId` réel existe. Certaines
 * vues (jours "intention", J+7→J+13) n'ont pas encore d'explication persistée — `explanationId`
 * vaut alors `""` (`read-today-plan.ts`) et le lien ne s'affiche simplement pas.
 */
export function ExplanationInline({ short, explanationId }: { short: string; explanationId: string }) {
  return (
    <div className="flex flex-col gap-1 text-body text-foreground-muted" data-testid="explanation-inline">
      <p>{short}</p>
      {explanationId ? <ExplanationSheet explanationId={explanationId} /> : null}
    </div>
  );
}
