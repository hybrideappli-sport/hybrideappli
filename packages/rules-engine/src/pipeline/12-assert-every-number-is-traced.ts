/**
 * Étape 12 — `assertEveryNumberIsTraced` — une ASSERTION, pas un log
 * (`08-architecture.md` §4.2 : "un run qui produirait une valeur chiffrée
 * non couverte par une trace échoue et ne persiste rien").
 *
 * Granularité retenue par `developer` : une entité (bloc / semaine / séance
 * / journée nutrition) est considérée couverte si AU MOINS une
 * `DecisionTrace` référence son `scope` + sa clé (`scopeRefId` ou
 * `scopeRefDate`) — pas nécessairement une trace par champ numérique
 * individuel. C'est une lecture volontairement pragmatique de "chaque
 * valeur chiffrée… couverte par au moins une trace" (ADR-002 §1, ADR-006) :
 * dans ce moteur, une même décision de règle produit typiquement PLUSIEURS
 * champs numériques d'un coup (ex. durée ET charge d'une séance) à partir
 * d'un seul raisonnement, donc d'une seule trace. Voir le rapport de fin de
 * lot pour la discussion de cette granularité.
 */

import type { DecisionTrace, PlanDraft } from "@hybride/domain";

function traceKey(scope: string, refId: string | null, refDate: string | null): string {
  return `${scope}:${refId ?? refDate ?? "none"}`;
}

export function assertEveryNumberIsTraced(plan: PlanDraft, traces: DecisionTrace[]): void {
  const covered = new Set(traces.map((t) => traceKey(t.scope, t.scopeRefId, t.scopeRefDate)));
  const missing: string[] = [];

  for (const block of plan.blocks) {
    if (!covered.has(traceKey("block", String(block.blockIndex), block.startDate))) {
      missing.push(`block#${block.blockIndex} (targetLoadUnits=${block.targetLoadUnits})`);
    }
  }
  for (const week of plan.weeks) {
    if (!covered.has(traceKey("week", null, week.weekStart))) {
      missing.push(`week ${week.weekStart} (targetLoadUnits=${week.targetLoadUnits})`);
    }
  }
  for (const session of plan.sessions) {
    if (!covered.has(traceKey("session", null, session.scheduledDate))) {
      missing.push(`session ${session.scheduledDate} (durationMin=${session.durationMin}, loadUnits=${session.loadUnits})`);
    }
  }
  for (const day of plan.nutritionDays) {
    if (!covered.has(traceKey("nutrition_day", null, day.date))) {
      missing.push(`nutritionDay ${day.date} (kcalTarget=${day.kcalTarget})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `assertEveryNumberIsTraced: ${missing.length} valeur(s) chiffrée(s) du PlanDraft ne sont couvertes par aucune ` +
        `DecisionTrace — le run échoue et ne doit rien persister (ADR-002 §1, ADR-006). Détail : ${missing.join("; ")}`,
    );
  }
}
