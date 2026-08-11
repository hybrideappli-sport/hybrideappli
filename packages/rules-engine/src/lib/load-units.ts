/**
 * `load_units` — unité de charge normalisée INTER-DISCIPLINES (ADR-004 §4).
 *
 * `load_units = round(duration_min × facteur_intensité(type) × facteur_discipline(famille))`.
 *
 * Fonction pure et documentée, comme l'exige ADR-004. Les facteurs sont des
 * heuristiques d'ingénierie assumées par `developer` (pas de valeur "à
 * trancher" par le fondateur dans le périmètre AC8) : ils ne sont PAS des
 * garde-fous de sécurité, seulement une clé de répartition/comparaison de
 * charge entre séances et entre disciplines (AC10). Documentées ici pour
 * rester auditables, comme tout le reste du moteur.
 */

import type { SessionType } from "@hybride/domain";

export const INTENSITY_FACTOR_BY_SESSION_TYPE: Record<SessionType, number> = {
  rest: 0,
  mobility: 0.3,
  technique: 0.5,
  endurance: 0.6,
  long: 0.7,
  cross_training: 0.7,
  strength: 0.8,
  tempo: 1.0,
  interval: 1.3,
  power: 1.3,
};

export const DISCIPLINE_FACTOR_BY_FAMILY: Record<"endurance" | "strength" | "mixed" | "skill", number> = {
  endurance: 1.0,
  strength: 1.1,
  mixed: 1.0,
  skill: 0.8,
};

export function computeLoadUnits(
  durationMin: number,
  sessionType: SessionType,
  sportFamily: "endurance" | "strength" | "mixed" | "skill" | null,
): number {
  const intensity = INTENSITY_FACTOR_BY_SESSION_TYPE[sessionType];
  const discipline = sportFamily ? DISCIPLINE_FACTOR_BY_FAMILY[sportFamily] : 1.0;
  return Math.max(0, Math.round(durationMin * intensity * discipline));
}
