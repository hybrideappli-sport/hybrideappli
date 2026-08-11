import "server-only";

import type { BodyMetricSnapshot, NutritionCheckinSnapshot, SessionLogSnapshot, WeekAggregateSnapshot } from "@hybride/domain";

import { startOfIsoWeekIso } from "../dates";

function average(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/**
 * Agrégation hebdomadaire LOCALE à `GET /progress/diagnosis` (Lot L4) — PAS le calcul canonique de
 * `history.completedWeeks` (laissé `[]` par `buildPlanningContext()`, réservé au job de révision
 * hebdomadaire du Lot L5, qui aura accès à `planned_sessions` pour un taux de complétion réalisé/
 * PRÉVU). Approximation assumée ici, documentée pour le rapport de fin de lot :
 *
 * - `completionRate` compare le réalisé au réalisé (proportion de séances `done` parmi les séances
 *   LOGUÉES cette semaine-là), pas au volume prévu par le plan — une semaine sans aucune saisie
 *   n'apparaît simplement pas comme une entrée plutôt que de compter comme 0 % d'observance.
 * - `totalLoadUnits` vaut `Number.NaN` (pas `0`) pour CHAQUE semaine : aucune source fiable de
 *   charge réalisée n'existe encore à ce lot (`session_logs` ne porte pas de charge propre — voir
 *   `build-planning-context.ts`). `NaN` est un sentinel délibéré : `evaluateStagnation()` (Lot L2,
 *   `packages/rules-engine/src/stagnation.ts::average()`) filtre déjà `Number.isFinite(v)` avant de
 *   moyenner — `NaN` en sort donc TOUJOURS, ce qui fait retomber `totalLoadUnits` agrégé à `null`
 *   et empêche `pickIndicator()` de choisir à tort l'indicateur "load" sur une fausse valeur `0`
 *   (qui aurait, elle, été considérée comme une donnée réelle et aurait pu déclencher un faux
 *   diagnostic de stagnation). Le type `WeekAggregateSnapshot.totalLoadUnits` n'est pas nullable
 *   (`number`, pas `number | null`) précisément parce qu'il est censé toujours être calculé par
 *   l'agrégateur canonique — `NaN` reste une valeur `number` valide au sens de TypeScript tout en
 *   étant traité comme « absent » par le code consommateur existant, sans modifier ce dernier.
 * - `performanceTimeSec` reste `null` : aucune notion de temps de référence/record n'est
 *   implémentée à ce lot (aucune table ne la porte) — l'indicateur "time" ne peut donc jamais être
 *   sélectionné, ce qui est le comportement honnête recherché plutôt qu'une valeur inventée.
 */
export function aggregateCompletedWeeks(history: {
  sessionLogs: SessionLogSnapshot[];
  nutritionCheckins: NutritionCheckinSnapshot[];
  bodyMetrics: BodyMetricSnapshot[];
}): WeekAggregateSnapshot[] {
  const weeks = new Map<
    string,
    { sessionLogs: SessionLogSnapshot[]; nutritionCheckins: NutritionCheckinSnapshot[]; bodyMetrics: BodyMetricSnapshot[] }
  >();

  function bucket(weekStart: string) {
    let entry = weeks.get(weekStart);
    if (!entry) {
      entry = { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [] };
      weeks.set(weekStart, entry);
    }
    return entry;
  }

  for (const log of history.sessionLogs) bucket(startOfIsoWeekIso(log.loggedDate)).sessionLogs.push(log);
  for (const checkin of history.nutritionCheckins) bucket(startOfIsoWeekIso(checkin.date)).nutritionCheckins.push(checkin);
  for (const metric of history.bodyMetrics) bucket(startOfIsoWeekIso(metric.measuredOn)).bodyMetrics.push(metric);

  return Array.from(weeks.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, entry]) => {
      const completionRate =
        entry.sessionLogs.length > 0 ? entry.sessionLogs.filter((l) => l.completion === "done").length / entry.sessionLogs.length : 0;
      return {
        weekStart,
        completionRate,
        avgRpe: average(entry.sessionLogs.map((l) => l.rpe).filter((v): v is number => v !== null)),
        avgFreshness: average(entry.sessionLogs.map((l) => l.freshness).filter((v): v is number => v !== null)),
        totalLoadUnits: Number.NaN,
        weightKg: average(entry.bodyMetrics.map((m) => m.weightKg).filter((v): v is number => v !== null)),
        performanceTimeSec: null,
        energyAvg: average(entry.nutritionCheckins.map((c) => c.energy)),
      } satisfies WeekAggregateSnapshot;
    });
}
