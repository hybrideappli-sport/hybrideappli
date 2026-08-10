/**
 * Vues « réalisé » minimales (`session_logs`/`nutrition_checkins`), réutilisées à la fois par
 * `TodaySessionView`/`TodayNutritionView` (`onboarding.ts`, déjà utilisées au Lot L3) et par les
 * contrats de la boucle quotidienne (`today-plan.ts`, Lot L4). Fichier feuille volontaire : aucune
 * dépendance vers `onboarding.ts` (évite un cycle d'imports entre les deux fichiers).
 */

import type { AdherenceLevel, BodyZone, CompletionStatus, PainLevel } from "./enums";

/** AC4 — résumé de la saisie déjà enregistrée pour une séance donnée, s'il en existe une. */
export interface SessionLogSummary {
  id: string;
  completion: CompletionStatus;
  actualDurationMin: number | null;
  rpe: number | null;
  freshness: number | null;
  pain: PainLevel;
  painZone: BodyZone | null;
  painAtRest: boolean;
  comment: string | null;
}

/** AC4, AC11 — résumé du check-in nutrition déjà enregistré pour un jour donné, s'il en existe un. */
export interface NutritionCheckinSummary {
  id: string;
  adherence: AdherenceLevel;
  energy: number;
  comment: string | null;
}
