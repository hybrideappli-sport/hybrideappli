import type { TodayNutritionView } from "@hybride/domain";

import { ExplanationInline } from "@/components/coach/explanation-inline";
import { Card, CardContent, CardHeader, CardLabel } from "@/components/ui/card";

/**
 * `D-nutrition-card` — carte autonome, comme dans la maquette (`jSZB0`). Le code fondait la
 * nutrition dans la carte coach et n'y affichait que les kcal : « 2 620 kcal aujourd'hui ».
 *
 * Les macros existaient pourtant déjà. `TodayNutritionView` porte `proteinG`, `carbsG` et `fatG`
 * depuis le Lot L3 — elles étaient calculées par le moteur, stockées, transportées jusqu'au
 * composant, et jetées à l'affichage. C'est un écart de rendu, pas un manque de donnée.
 */
export function NutritionCard({ nutrition }: { nutrition: TodayNutritionView }) {
  return (
    <Card data-testid="nutrition-card">
      <CardHeader className="gap-2">
        <CardLabel>Nutrition du jour</CardLabel>
        {/* `--text-heading` : une ligne de données chiffrées, jamais du serif (charte §2.1,
            règle d'or). Le point médian sépare les macros comme dans la maquette. */}
        <p className="text-heading font-semibold text-foreground" data-testid="nutrition-targets">
          {nutrition.kcalTarget} kcal · P {nutrition.proteinG} g · G {nutrition.carbsG} g · L{" "}
          {nutrition.fatG} g
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <ExplanationInline
          short={nutrition.explanation.short}
          explanationId={nutrition.explanation.explanationId}
        />
      </CardContent>
    </Card>
  );
}
