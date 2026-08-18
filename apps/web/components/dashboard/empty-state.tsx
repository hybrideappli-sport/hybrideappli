import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * `DashboardEmptyState` — état vide « premier accès, plan tout juste généré, aucune séance encore
 * enregistrée » (`04-flow.md`). Se déclenche quand aucun plan actif n'existe encore (défensif :
 * l'onboarding en génère toujours un — AC1 — ce cas ne devrait normalement pas survenir en usage
 * normal, mais couvre un compte créé sans onboarding complété, ou une régénération en échec).
 */
export function DashboardEmptyState() {
  return (
    <div className="rounded-lg bg-surface p-6 text-center" data-testid="dashboard-empty-state">
      <p className="font-serif text-title text-foreground">Ton plan n&apos;est pas encore prêt</p>
      <p className="mt-1 text-body text-foreground-muted">Termine ton onboarding avec le coach pour obtenir ton premier plan personnalisé.</p>
      <Button asChild className="mt-4">
        <Link href="/onboarding/chat">Reprendre l&apos;onboarding</Link>
      </Button>
    </div>
  );
}
