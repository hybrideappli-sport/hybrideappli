/**
 * Étape 2 — `resolvePainState` (AC9).
 *
 * Enveloppe `evaluatePainProtocol` (exportée aussi de façon autonome, voir
 * `08-architecture.md` §4.1) et la traduit en zones/groupes musculaires à
 * exclure de la construction des séances (étape 9).
 */

import type { DecisionTrace, MuscleGroup, PlanningContext, Ruleset } from "@hybride/domain";
import { evaluatePainProtocol } from "../pain-protocol";
import type { TraceFactory } from "../lib/trace";
import { PAIN_ZONE_MUSCLE_GROUPS } from "../lib/pain-zone-muscles";

export interface PainState {
  blockedMuscleGroups: Set<MuscleGroup>;
  /** true si au moins une zone est en niveau 'acute' — sans alternative d'auto-adaptation (AC9 niveau 3). */
  hasAcuteZone: boolean;
}

export function resolvePainState(
  context: PlanningContext,
  ruleset: Ruleset,
  traceFactory: TraceFactory,
): { painState: PainState; traces: DecisionTrace[] } {
  const result = evaluatePainProtocol(context, ruleset, traceFactory);

  const blockedMuscleGroups = new Set<MuscleGroup>();
  let hasAcuteZone = false;

  for (const zoneState of result.zoneStates) {
    if (zoneState.zoneBlocked) {
      for (const group of PAIN_ZONE_MUSCLE_GROUPS[zoneState.zone]) blockedMuscleGroups.add(group);
    }
    if (zoneState.level === "acute") hasAcuteZone = true;
  }

  return {
    painState: { blockedMuscleGroups, hasAcuteZone },
    traces: result.zoneStates.map((z) => z.trace),
  };
}
