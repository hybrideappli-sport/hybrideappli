/**
 * V — charge soutenue (ADR-014 §1). La matière première demandée par l'AC7.
 *
 * `L_chronic = moyenne des load_units hebdomadaires réalisées sur la fenêtre chronique`
 * `V = min(1, ln(1 + L_chronic / ref) / ln 2)`
 *
 * Courbe concave, saturante, plafonnée à 1 : un athlète qui double son volume gagne beaucoup
 * quand il part de bas, peu quand il est déjà chargé, et RIEN DU TOUT au-delà de la référence. Le
 * score ne récompense donc jamais la surcharge.
 */

import type { HybridScoreSessionInput } from "@hybride/domain";

export interface VolumeSubscoreResult {
  /** `L_chronic` — charge hebdomadaire moyenne réalisée sur la fenêtre (load_units/semaine). */
  raw: number;
  /** `V` ∈ [0, 1]. */
  normalized: number;
}

export function computeVolumeSubscore(
  sessionsInChronicWindow: HybridScoreSessionInput[],
  chronicWindowDays: number,
  chronicLoadReferenceUnits: number,
): VolumeSubscoreResult {
  const totalLoadUnits = sessionsInChronicWindow.reduce((sum, session) => sum + session.loadUnits, 0);
  const weeksInWindow = chronicWindowDays / 7;
  const raw = weeksInWindow > 0 ? totalLoadUnits / weeksInWindow : 0;

  if (raw <= 0 || chronicLoadReferenceUnits <= 0) {
    return { raw: Math.max(0, raw), normalized: 0 };
  }

  const normalized = Math.min(1, Math.log(1 + raw / chronicLoadReferenceUnits) / Math.log(2));
  return { raw, normalized };
}
