/**
 * Étape 3 — `resolveObjectiveFeasibility` (AC2).
 *
 * Enveloppe `evaluateObjectiveFeasibility` (exportée aussi de façon
 * autonome). Le statut est tracé quelle que soit sa valeur ; il n'interrompt
 * PAS la construction du plan (la bifurcation "négociation avant plan" est
 * une responsabilité de l'orchestrateur `completeOnboarding()`, hors
 * périmètre du moteur pur — voir le rapport de fin de lot).
 */

import type { DecisionTrace, FeasibilityStatus, PlanningContext, Ruleset } from "@hybride/domain";
import { evaluateObjectiveFeasibility } from "../objective-feasibility.js";
import type { TraceFactory } from "../lib/trace.js";

export function resolveObjectiveFeasibility(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { status: FeasibilityStatus; traces: DecisionTrace[] } {
  const result = evaluateObjectiveFeasibility(context, ruleset, traceFactory);
  return { status: result.status, traces: [result.trace] };
}
