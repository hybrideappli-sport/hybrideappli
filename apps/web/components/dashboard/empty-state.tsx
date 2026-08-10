/**
 * `DashboardEmptyState` — état vide « premier accès, plan tout juste généré, aucune séance encore
 * enregistrée » (`04-flow.md`). Se déclenche quand aucun plan actif n'existe encore (défensif :
 * l'onboarding en génère toujours un — AC1 — ce cas ne devrait normalement pas survenir en usage
 * normal, mais couvre un compte créé sans onboarding complété, ou une régénération en échec).
 */
export function DashboardEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600" data-testid="dashboard-empty-state">
      <p className="font-medium text-neutral-800">Ton plan n&apos;est pas encore prêt</p>
      <p className="mt-1">Termine ton onboarding avec le coach pour obtenir ton premier plan personnalisé.</p>
      <a href="/onboarding/chat" className="mt-3 inline-block text-sm font-medium text-orange-500 underline-offset-4 hover:underline">
        Reprendre l&apos;onboarding
      </a>
    </div>
  );
}
