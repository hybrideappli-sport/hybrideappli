/**
 * Petits prédicats partagés par plusieurs étapes du pipeline (AC4, AC8).
 */

import { INTENSE_SESSION_TYPES, TRIGGERS_ALLOWING_INCREASE } from "@hybride/domain";
import type { PainEpisodeSnapshot, PlanTrigger, SessionLogSnapshot, SessionType } from "@hybride/domain";
import { diffDays } from "./dates.js";

export function isIntenseSessionType(sessionType: SessionType): boolean {
  return INTENSE_SESSION_TYPES.includes(sessionType);
}

/**
 * AC4 / ADR-005 §5 : seuls `weekly_review` et `objective_renegotiation`
 * autorisent une hausse de charge. Voir `enums.ts` pour le détail de cet
 * arbitrage documentaire.
 */
export function isIncreaseAllowedForTrigger(trigger: PlanTrigger): boolean {
  return TRIGGERS_ALLOWING_INCREASE.includes(trigger);
}

const RECENT_SIGNAL_WINDOW_DAYS = 3;
const HIGH_RPE_THRESHOLD = 8;
const LOW_FRESHNESS_THRESHOLD = 2;

/**
 * AC8, 2ᵉ alinéa : "tant qu'un signal de fatigue ou de douleur actif est
 * présent […], toute hausse de charge est bloquée indépendamment de
 * l'échéance de révision hebdomadaire." Un signal est actif si :
 *  - une zone de douleur est actuellement bloquée (épisode 'persistent'/'acute'
 *    non résolu), ou
 *  - la séance loguée la plus récente, dans la fenêtre des 3 derniers jours
 *    avant `now`, rapporte un RPE élevé, une fraîcheur basse, ou une douleur.
 */
export function hasActiveNegativeSignal(
  now: string,
  sessionLogs: SessionLogSnapshot[],
  painEpisodes: PainEpisodeSnapshot[],
): boolean {
  const blockedPain = painEpisodes.some(
    (ep) => ep.resolvedAt === null && (ep.level === "persistent" || ep.level === "acute"),
  );
  if (blockedPain) return true;

  const recentLogs = sessionLogs.filter((log) => {
    const delta = diffDays(log.loggedDate, now);
    return delta >= 0 && delta <= RECENT_SIGNAL_WINDOW_DAYS;
  });

  return recentLogs.some(
    (log) =>
      (log.rpe !== null && log.rpe >= HIGH_RPE_THRESHOLD) ||
      (log.freshness !== null && log.freshness <= LOW_FRESHNESS_THRESHOLD) ||
      log.pain !== "none",
  );
}
