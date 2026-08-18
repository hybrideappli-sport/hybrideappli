import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Ruleset, TodaySessionView } from "@hybride/domain";

import { addDaysIso } from "../dates";
import { fetchTodaySessionView } from "./read-today-plan";

export interface GlidingWeekDayView {
  date: string; // ISO date
  session: TodaySessionView; // jours de repos exclus — voir `fetchGlidingWeekPreview`
}

/**
 * `D-planning-card` (Dashboard, `10-design-feature3-notes.md` §2) — aperçu GLISSANT `now → now+6`,
 * jamais une grille Lun→Dim (`WeeklyPreviewCard` historique, avant l'US-03). Réutilise
 * `fetchTodaySessionView()`, le MÊME primitive de lecture que `/plan/today` et `/plan/week` — même
 * source de vérité (AC5), pas de calcul dupliqué. Seuls les jours PORTANT une séance sont retenus
 * (design : 3 lignes d'exemple, jamais une ligne "Repos" dans cet aperçu condensé — à la différence
 * de l'écran `/planning` détaillé, qui montre chaque jour).
 */
export async function fetchGlidingWeekPreview(
  admin: SupabaseClient<Database>,
  args: { userId: string; planVersionId: string; now: { date: string; time: string }; ruleset: Ruleset; days?: number },
): Promise<GlidingWeekDayView[]> {
  const { userId, planVersionId, now, ruleset, days = 7 } = args;
  const dates = Array.from({ length: days }, (_, i) => addDaysIso(now.date, i));

  const sessions = await Promise.all(dates.map((date) => fetchTodaySessionView(admin, { userId, planVersionId, date, now, ruleset })));

  const result: GlidingWeekDayView[] = [];
  dates.forEach((date, index) => {
    const session = sessions[index];
    if (session) result.push({ date, session });
  });
  return result;
}
