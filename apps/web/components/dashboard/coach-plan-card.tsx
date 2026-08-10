import Link from "next/link";
import type { TodayNutritionView, TodaySessionView } from "@hybride/domain";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="border-2 border-orange-400" data-testid="coach-plan-card">
      <CardHeader>
        <CardTitle>Ton coach aujourd&apos;hui</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {session ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-neutral-900">
              {SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}
              {session.durationMin ? ` — ${session.durationMin} min` : ""}
            </p>
            <ExplanationInline short={session.explanation.short} explanationId={session.explanation.explanationId} />
          </div>
        ) : (
          <p className="text-sm text-neutral-600" data-testid="dashboard-rest-day">
            Aucune séance prévue aujourd&apos;hui — jour de repos.
          </p>
        )}

        {nutrition ? (
          <div className="flex flex-col gap-1 border-t border-neutral-100 pt-3">
            <p className="text-sm font-medium text-neutral-900">{nutrition.kcalTarget} kcal aujourd&apos;hui</p>
            <ExplanationInline short={nutrition.explanation.short} explanationId={nutrition.explanation.explanationId} />
          </div>
        ) : null}

        <Link href="/aujourdhui" className="text-sm font-medium text-orange-500 underline-offset-4 hover:underline">
          Ouvrir ma séance / mon repas du jour
        </Link>
      </CardContent>
    </Card>
  );
}
