import type { TodayNutritionView } from "@hybride/domain";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExplanationInline } from "@/components/coach/explanation-inline";

const MODULATION_LABELS: Record<string, string> = {
  rest: "Jour de repos",
  endurance: "Séance d'endurance",
  intensity: "Séance intense",
};

/** `NutritionTargets` — AC11 : cibles modulées à la séance + conseils avant/pendant/après. */
export function NutritionTargets({ nutrition }: { nutrition: TodayNutritionView }) {
  return (
    <Card data-testid="nutrition-targets">
      <CardHeader>
        <CardTitle className="text-sm">Nutrition du jour — {MODULATION_LABELS[nutrition.modulationReason] ?? nutrition.modulationReason}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-neutral-700">
        <div className="flex gap-4">
          <span className="font-medium">{nutrition.kcalTarget} kcal</span>
          <span>{nutrition.proteinG} g protéines</span>
          <span>{nutrition.carbsG} g glucides</span>
          <span>{nutrition.fatG} g lipides</span>
        </div>
        <div className="flex flex-col gap-1 text-neutral-600">
          {nutrition.advice.pre ? (
            <p>
              <span className="font-medium">Avant — </span>
              {nutrition.advice.pre}
            </p>
          ) : null}
          {nutrition.advice.during ? (
            <p>
              <span className="font-medium">Pendant — </span>
              {nutrition.advice.during}
            </p>
          ) : null}
          {nutrition.advice.post ? (
            <p>
              <span className="font-medium">Après — </span>
              {nutrition.advice.post}
            </p>
          ) : null}
        </div>
        <ExplanationInline short={nutrition.explanation.short} explanationId={nutrition.explanation.explanationId} />
      </CardContent>
    </Card>
  );
}
