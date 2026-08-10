import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * `WeeklyPreviewCard` — AC13 : contenu débloqué (`entitlement.canViewWeek`). La vue semaine
 * complète (`GET /plan/week`) n'est pas construite à ce lot (Lot L5/aperçu multi-échelles) — cette
 * carte reste un aperçu léger volontairement minimal, pas une duplication anticipée de `/semaine`.
 */
export function WeeklyPreviewCard() {
  return (
    <Card data-testid="weekly-preview-card">
      <CardHeader>
        <CardTitle className="text-sm">Aperçu de ta semaine</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-neutral-600">
        <p>La vue complète de ta semaine (planning détaillé, vision macro) arrive avec la révision hebdomadaire.</p>
      </CardContent>
    </Card>
  );
}

/** Variante masquée pour `PaywallGate` (AC13) — teaser flouté, ton non punitif. */
export function WeeklyPreviewLocked() {
  return (
    <Card className="relative overflow-hidden" data-testid="weekly-preview-locked">
      <CardHeader>
        <CardTitle className="text-sm">Aperçu de ta semaine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-neutral-500">
        <p aria-hidden className="select-none blur-sm">
          Lun · Mar · Mer · Jeu · Ven · Sam · Dim — vision complète de ta semaine
        </p>
        <p className="font-medium text-neutral-700">Réservé aux abonnés — passe en illimité pour voir ta semaine complète.</p>
      </CardContent>
    </Card>
  );
}
