/** `RestDayEmptyState` — état vide « jour de repos », explicite, jamais une erreur (`04-flow.md`). */
export function RestDayEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600" data-testid="rest-day-empty-state">
      <p className="font-medium text-neutral-800">Rien de prévu aujourd&apos;hui</p>
      <p className="mt-1">C&apos;est un jour de repos dans ton plan — profites-en pour récupérer.</p>
    </div>
  );
}
