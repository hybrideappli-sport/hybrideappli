import Link from "next/link";

import type { MacroPlanResponse } from "@hybride/domain";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GlidingWeekDayView } from "@/lib/orchestration/read-gliding-week";
import { PlacementBadge } from "@/components/planning/placement-badge";

const WEEKDAY_LABELS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"] as const;

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

function isoWeekdayLabel(date: string): string {
  const jsDay = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return WEEKDAY_LABELS[jsDay === 0 ? 6 : jsDay - 1]!;
}

/**
 * `D-planning-card` — `10-design-feature3-notes.md` §2. Aperçu GLISSANT `J → J+7` (jamais une
 * grille Lun→Dim), colonne heure + reflet des états d'imprévu (AC5 — même source que `/planning`,
 * `/plan/week`/`/plan/today`, aucun calcul dupliqué). Le bloc verrouillé (`WeeklyPreviewLocked`)
 * reste inchangé, sous verrou : aucune heure ni état d'imprévu n'y fuit (design §2.4).
 */
export function WeeklyPreviewCard({ days, macroFocus }: { days: GlidingWeekDayView[]; macroFocus: string | null }) {
  return (
    <Card data-testid="weekly-preview-card">
      <CardHeader>
        <CardTitle>Planning glissant · J → J+7</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body text-foreground-muted">
        {days.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="weekly-preview-days">
            {days.map((day) => {
              const { session } = day;
              const time = session.placement?.scheduledTime ?? null;
              const isCancelled = session.placement?.status === "cancelled_week";
              return (
                <li key={day.date} className="flex items-center gap-3" data-testid="weekly-preview-day">
                  <span className="text-label w-11 shrink-0 text-foreground-subtle">{isoWeekdayLabel(day.date)}</span>
                  <span className="text-small w-13 shrink-0 text-foreground" aria-hidden={time === null}>
                    {time ?? "—"}
                  </span>
                  <span className={`text-body-strong flex-1 truncate ${isCancelled ? "text-foreground-subtle" : "text-foreground"}`}>
                    {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
                  </span>
                  {session.placement ? <PlacementBadge status={session.placement.status} /> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Aucune séance planifiée dans les 7 prochains jours.</p>
        )}
        {macroFocus ? (
          <p className="border-t border-border-subtle pt-2 text-caption text-foreground-subtle" data-testid="weekly-preview-macro-focus">
            Bloc en cours : {macroFocus}
          </p>
        ) : null}
        <Link href="/planning" className="text-small font-medium text-accent-text hover:text-accent-hover hover:underline" data-testid="weekly-preview-see-more">
          Voir ma semaine →
        </Link>
      </CardContent>
    </Card>
  );
}

export function macroFocusForToday(macro: MacroPlanResponse, today: string): string | null {
  const current = macro.blocks.find((block) => block.startDate <= today && today <= block.endDate);
  return current?.focus ?? null;
}

/** Variante masquée pour `PaywallGate` (AC13) — teaser flouté, ton non punitif. Inchangée par l'US-03 (design §2.4). */
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
