import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { placeWeekSessions } from "@hybride/rules-engine";
import type { PlacementTriggerReason, Ruleset } from "@hybride/domain";

import { startOfIsoWeekIso } from "../dates";
import { buildPlacementInputForWeek } from "./build-placement-input";
import { materializeSessionPlacements } from "./materialize-session-placements";

/**
 * `placeAndMaterializeVersion()` — appelée depuis `regeneratePlan()` (dans la même transaction
 * logique, APRÈS `materializePlanVersion()`, `08-architecture.md` §14.2) et depuis le job
 * `refresh_placements`. Place TOUTES les semaines couvertes par la version (J → J+13, ADR-004 §3) :
 * au plus deux semaines ISO en pratique.
 */
export async function placeAndMaterializeVersion(
  admin: SupabaseClient<Database>,
  args: { userId: string; planVersionId: string; now: { date: string; time: string }; triggerReason: PlacementTriggerReason; ruleset: Ruleset },
): Promise<void> {
  const { userId, planVersionId, now, triggerReason, ruleset } = args;

  const { data, error } = await admin.from("planned_sessions").select("scheduled_date").eq("plan_version_id", planVersionId);
  if (error) throw new Error(`placeAndMaterializeVersion: planned_sessions — ${error.message}`);

  const weekStarts = Array.from(new Set((data ?? []).map((row) => startOfIsoWeekIso(row.scheduled_date))));

  for (const weekStart of weekStarts) {
    const built = await buildPlacementInputForWeek(admin, { userId, planVersionId, weekStart, now, triggerReason, ruleset });
    if (!built) continue;
    const result = placeWeekSessions(built.input, ruleset);
    await materializeSessionPlacements(admin, {
      userId,
      planVersionId,
      weekStart,
      rulesetVersion: ruleset.version,
      decisions: result.decisions,
      slotBySessionId: built.slotBySessionId,
    });
  }
}
