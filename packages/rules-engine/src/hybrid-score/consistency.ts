/**
 * R — régularité (ADR-014 §1).
 *
 * `R = min(1, jours d'entraînement distincts sur la fenêtre chronique / target_active_days_per_28d)`
 *
 * Compte les jours RÉELLEMENT actifs, pas le taux de respect du plan — délibéré, cf. AC6 de la F1
 * (jamais de durcissement en réponse à une inobservance). Une séance faite hors plan compte
 * exactement comme une séance planifiée : ce module ne connaît d'ailleurs même pas la notion de
 * "planifié", seulement des séances réalisées.
 */

import type { HybridScoreSessionInput } from "@hybride/domain";

export interface ConsistencySubscoreResult {
  /** Nombre de jours calendaires distincts avec au moins une charge réalisée > 0. */
  raw: number;
  /** `R` ∈ [0, 1]. */
  normalized: number;
}

export function computeConsistencySubscore(
  sessionsInChronicWindow: HybridScoreSessionInput[],
  targetActiveDaysPer28d: number,
): ConsistencySubscoreResult {
  const activeDays = new Set(sessionsInChronicWindow.filter((session) => session.loadUnits > 0).map((session) => session.loggedDate));
  const raw = activeDays.size;
  const normalized = targetActiveDaysPer28d > 0 ? Math.min(1, raw / targetActiveDaysPer28d) : 0;
  return { raw, normalized };
}
