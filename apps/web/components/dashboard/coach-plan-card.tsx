import Link from "next/link";
import type { TodayNutritionView, TodaySessionView } from "@hybride/domain";

import { Card, CardContent, CardHeader, CardLabel, CardTitle } from "@/components/ui/card";
import { ExplanationInline } from "@/components/coach/explanation-inline";

const SESSION_TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Renforcement",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

/**
 * `CoachPlanCard` — AC1 : plan du jour du coach IA, affiché EN PREMIER sur le Dashboard, bordure
 * accent (`05-zoning-pencil.md`, `06-recap.md` §6 : priorité éditoriale confirmée).
 */
export function CoachPlanCard({ session, nutrition }: { session: TodaySessionView | null; nutrition: TodayNutritionView | null }) {
  return (
    <Card data-testid="coach-plan-card">
      <CardHeader className="gap-2">
        <CardLabel tone="accent">Plan du jour · Coach IA</CardLabel>
        <CardTitle>Ton coach aujourd&apos;hui</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {session ? (
          <div className="flex flex-col gap-1">
            <p className="text-body-strong font-semibold text-foreground">
              {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
              {session.durationMin ? ` — ${session.durationMin} min` : ""}
            </p>
            <ExplanationInline short={session.explanation.short} explanationId={session.explanation.explanationId} />
          </div>
        ) : (
          <p className="text-body text-foreground-muted" data-testid="dashboard-rest-day">
            Aucune séance prévue aujourd&apos;hui — jour de repos.
          </p>
        )}

        {nutrition ? (
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
            <p className="text-body-strong font-semibold text-foreground">{nutrition.kcalTarget} kcal aujourd&apos;hui</p>
            <ExplanationInline short={nutrition.explanation.short} explanationId={nutrition.explanation.explanationId} />
          </div>
        ) : null}

        {/* `11-design-notes.md` §2.3 — le libellé passe à « Enregistrer une séance » quand rien
            n'est prévu (jour de repos) : c'est le point d'entrée du Cas B, `S-offplan-block` déplié
            d'emblée sur `/aujourdhui` (AC3, jamais bloqué faute d'intégration pour son sport). */}
        <Link href="/aujourdhui" className="text-body-strong font-semibold text-accent underline-offset-4 hover:underline">
          {session === null ? "Enregistrer une séance →" : "Ouvrir ma séance / mon repas du jour →"}
        </Link>
      </CardContent>
    </Card>
  );
}
