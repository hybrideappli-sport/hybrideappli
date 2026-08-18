import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { MacroPlanResponse, Ruleset, WeekPlanResponse } from "@hybride/domain";

import { addDaysIso } from "../dates";
import { fetchTodayNutritionView, fetchTodaySessionView } from "./read-today-plan";

/**
 * `GET /plan/week` (finding B4) — réutilise `fetchTodaySessionView`/`fetchTodayNutritionView`
 * (`read-today-plan.ts`) jour par jour : la vue d'une séance/journée nutrition ne dépend pas de
 * savoir si `date === now` (ces fonctions résolvent déjà un repli neutre quand `explanation_id`
 * est absent — semaines "intention" J+8→J+14, `04-build-macro-blocks.ts`).
 *
 * US-03 — `days[].sessions[]` (pluriel) : rupture de contrat ASSUMÉE (`08-architecture.md` §14.5).
 * Un jour ne porte aujourd'hui au plus qu'une séance par construction du moteur F1
 * (`09-build-sessions.ts`, `order_in_day` toujours 1), mais le placement F3 peut en poser deux le
 * même jour lors d'un replacement — la forme reste un tableau pour ne pas devoir la refaire évoluer.
 * `now` est le moment RÉEL (`nowPartsInTimezone()`), distinct de chaque `date` de la boucle —
 * nécessaire à `SessionPlacementView.canReportIncident` (ADR-016 §7).
 */
export async function fetchWeekPlan(
  admin: SupabaseClient<Database>,
  args: { userId: string; planVersionId: string; weekStart: string; now: { date: string; time: string }; ruleset: Ruleset },
): Promise<WeekPlanResponse | null> {
  const { userId, planVersionId, weekStart, now, ruleset } = args;

  const { data: weekRow, error } = await admin
    .from("plan_weeks")
    .select("week_start, is_deload, target_load_units")
    .eq("plan_version_id", planVersionId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error(`fetchWeekPlan: plan_weeks — ${error.message}`);
  if (!weekRow) return null;

  const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
  const days = await Promise.all(
    dates.map(async (date) => {
      const [session, nutrition] = await Promise.all([
        fetchTodaySessionView(admin, { userId, planVersionId, date, now, ruleset }),
        fetchTodayNutritionView(admin, { userId, planVersionId, date }),
      ]);
      return { date, sessions: session ? [session] : [], nutrition };
    }),
  );

  return { weekStart: weekRow.week_start, isDeload: weekRow.is_deload, targetLoadUnits: weekRow.target_load_units, days };
}

/** `GET /plan/macro` (finding B4) — tous les blocs de la version de plan active, déjà bornés à l'objectif (`04-build-macro-blocks.ts`). */
export async function fetchMacroPlan(admin: SupabaseClient<Database>, args: { planVersionId: string }): Promise<MacroPlanResponse> {
  const { data, error } = await admin
    .from("plan_blocks")
    .select("block_index, block_type, start_date, end_date, focus, target_load_units")
    .eq("plan_version_id", args.planVersionId)
    .order("block_index", { ascending: true });
  if (error) throw new Error(`fetchMacroPlan: plan_blocks — ${error.message}`);

  return {
    blocks: (data ?? []).map((row) => ({
      blockIndex: row.block_index,
      blockType: row.block_type,
      startDate: row.start_date,
      endDate: row.end_date,
      focus: row.focus,
      targetLoadUnits: row.target_load_units,
    })),
  };
}
