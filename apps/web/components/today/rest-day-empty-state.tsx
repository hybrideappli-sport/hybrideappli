/** `RestDayEmptyState` — état vide « jour de repos », explicite, jamais une erreur (`04-flow.md`). */
export function RestDayEmptyState() {
  return (
    <div className="rounded-lg bg-surface p-6 text-center" data-testid="rest-day-empty-state">
      <p className="font-serif text-title text-foreground">Rien de prévu aujourd&apos;hui</p>
      <p className="mt-1 text-body text-foreground-muted">C&apos;est un jour de repos dans ton plan — profites-en pour récupérer.</p>
    </div>
  );
}
