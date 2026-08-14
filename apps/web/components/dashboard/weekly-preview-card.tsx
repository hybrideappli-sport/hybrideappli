import type { MacroPlanResponse, WeekPlanResponse } from "@hybride/domain";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

const SESSION_TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Force",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

/**
 * `WeeklyPreviewCard` — AC13, finding B4. Contenu RÉEL (`GET /plan/week`/`GET /plan/macro`,
 * matérialisés par `materializePlanVersion()` et déjà en base via `plan_blocks`) plutôt qu'un texte
 * placeholder annonçant une fonctionnalité qui n'existait pas encore : l'abonné voit ici
 * effectivement « la vue semaine complète, la vision macro par blocs » promises par AC13.
 */
export function WeeklyPreviewCard({ week, macroFocus }: { week: WeekPlanResponse | null; macroFocus: string | null }) {
  return (
    <Card data-testid="weekly-preview-card">
      <CardHeader>
        <CardTitle>Ta semaine complète</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body text-foreground-muted">
        {week ? (
          <>
            <ul className="grid grid-cols-7 gap-1 text-center" data-testid="weekly-preview-days">
              {week.days.map((day, index) => (
                <li key={day.date} className="flex flex-col items-center gap-1">
                  <span className="text-caption font-medium text-foreground-subtle">{WEEKDAY_LABELS[index]}</span>
                  <span
                    className={`w-full rounded-md px-1 py-2 text-[11px] leading-tight ${day.session ? "bg-accent-subtle text-accent" : "bg-surface-raised text-foreground-subtle"}`}
                  >
                    {day.session ? (SESSION_TYPE_LABELS[day.session.sessionType] ?? day.session.sessionType) : "Repos"}
                  </span>
                </li>
              ))}
            </ul>
            {week.isDeload ? <p className="text-caption font-medium text-foreground-subtle">Semaine de décharge (AC8) — volume réduit, non désactivable.</p> : null}
          </>
        ) : (
          <p>Ta vue semaine apparaîtra ici dès que ton plan sera généré.</p>
        )}
        {macroFocus ? (
          <p className="border-t border-border-subtle pt-2 text-caption text-foreground-subtle" data-testid="weekly-preview-macro-focus">
            Bloc en cours : {macroFocus}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function macroFocusForToday(macro: MacroPlanResponse, today: string): string | null {
  const current = macro.blocks.find((block) => block.startDate <= today && today <= block.endDate);
  return current?.focus ?? null;
}

/** Variante masquée pour `PaywallGate` (AC13) — teaser flouté, ton non punitif. */
export function WeeklyPreviewLocked() {
  return (
    <Card className="relative overflow-hidden" data-testid="weekly-preview-locked">
      <CardHeader>
        <CardTitle>Aperçu de ta semaine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-body text-foreground-muted">
        <p aria-hidden className="select-none blur-sm">
          Lun · Mar · Mer · Jeu · Ven · Sam · Dim — vision complète de ta semaine
        </p>
        <p className="font-medium text-foreground">Réservé aux abonnés — passe en illimité pour voir ta semaine complète.</p>
      </CardContent>
    </Card>
  );
}
