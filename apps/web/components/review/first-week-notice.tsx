/** `FirstWeekNotice` — cas `fromWeek = null` (ADR-005 §"cas explicite") : jamais laissé en erreur. */
export function FirstWeekNotice() {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600" data-testid="first-week-notice">
      <p className="font-medium text-neutral-800">Première semaine — rien à comparer pour l&apos;instant</p>
      <p className="mt-1">
        Ton coach n&apos;a pas encore de semaine précédente à comparer à celle-ci. Ce diff s&apos;enrichira dès la prochaine révision hebdomadaire.
      </p>
    </div>
  );
}
