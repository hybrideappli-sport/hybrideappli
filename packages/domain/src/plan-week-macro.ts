/**
 * `GET /plan/week` / `GET /plan/macro` (AC1, AC13) — `08-architecture.md` §6.3.
 *
 * Correction post-revue (finding B4) : ces deux routes premium étaient documentées et facturées
 * (Stripe réel, `sk_live`) mais jamais implémentées — `plan_blocks`/`plan_weeks`/`planned_sessions`
 * existaient déjà en base (matérialisés par `materializePlanVersion()`), seule l'exposition
 * manquait. Réutilise les mêmes vues que `GET /plan/today` (`TodaySessionView`/`TodayNutritionView`,
 * `onboarding.ts`) : la forme d'une séance/journée nutrition est identique, qu'elle vienne
 * d'aujourd'hui ou d'un autre jour de la même version de plan.
 */

import type { TodayNutritionView, TodaySessionView } from "./onboarding";

// ---------------------------------------------------------------------------
// GET /plan/week?weekStart= (premium)
// ---------------------------------------------------------------------------

export interface WeekPlanDayView {
  date: string; // ISO date
  /**
   * US-03 — pluriel, `08-architecture.md` §14.5 : rupture de contrat ASSUMÉE (`session` singulier
   * → `sessions[]`). Le placement peut poser deux séances le même jour (design F3 §1.3, « gap
   * entre deux séances d'un même jour »), ce que la forme précédente rendait inexprimable.
   * `[]` = jour de repos.
   */
  sessions: TodaySessionView[];
  nutrition: TodayNutritionView | null;
}

export interface WeekPlanResponse {
  weekStart: string; // ISO date, lundi
  isDeload: boolean; // AC8
  targetLoadUnits: number;
  days: WeekPlanDayView[]; // 7 jours, lundi → dimanche
}

// ---------------------------------------------------------------------------
// GET /plan/macro (premium)
// ---------------------------------------------------------------------------

export interface MacroPlanBlockView {
  blockIndex: number;
  blockType: string; // 'base'|'build'|'specific'|'taper'|'transition'|'recovery'
  startDate: string; // ISO date
  endDate: string; // ISO date
  focus: string | null;
  targetLoadUnits: number | null;
}

export interface MacroPlanResponse {
  blocks: MacroPlanBlockView[]; // ordonnés par blockIndex — tous les blocs jusqu'à l'objectif
}
