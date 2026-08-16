import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { DaySlot, PlacementDecision } from "@hybride/domain";

import { fetchCurrentPlacementsBySessionId } from "./read-session-placements";

/**
 * `materializeSessionPlacements()` — CHEMIN D'ÉCRITURE UNIQUE de `session_placements` (ADR-016 §2,
 * pendant exact de `materializePlanVersion()` pour le prévu et de `finalizeSessionLogLoad()` pour
 * le réalisé). Appelée depuis EXACTEMENT trois endroits : `regeneratePlan()` (après
 * `materializePlanVersion()`), `resolveScheduleIncident()`, et le job `refresh_placements`. Aucun
 * autre module n'écrit cette table — vérifiable par `grep`, comme ADR-004 §2.
 *
 * Supersède, n'écrase jamais : une séance déjà placée reçoit une NOUVELLE ligne, et l'ancienne est
 * marquée `superseded_at`/`superseded_by_placement_id` — jamais un `UPDATE` de son contenu (le
 * trigger `session_placements_supersede_only` l'interdirait de toute façon, y compris en
 * `service_role`).
 */
export async function materializeSessionPlacements(
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    planVersionId: string;
    weekStart: string;
    rulesetVersion: string;
    decisions: PlacementDecision[];
    /** `planned_sessions.slot` — l'intention DÉCLARÉE de F1, jamais recalculée par la F3. */
    slotBySessionId: Map<string, DaySlot>;
  },
): Promise<Map<string, string>> {
  const { userId, planVersionId, weekStart, rulesetVersion, decisions, slotBySessionId } = args;
  const newPlacementIdBySessionId = new Map<string, string>();
  if (decisions.length === 0) return newPlacementIdBySessionId;

  const existingBySessionId = await fetchCurrentPlacementsBySessionId(admin, {
    userId,
    plannedSessionIds: decisions.map((d) => d.sessionId),
  });

  type PlacementInsert = Database["public"]["Tables"]["session_placements"]["Insert"];
  const rows: PlacementInsert[] = decisions.map((decision) => {
    const id = randomUUID();
    newPlacementIdBySessionId.set(decision.sessionId, id);
    return {
      id,
      user_id: userId,
      planned_session_id: decision.sessionId,
      plan_version_id: planVersionId,
      week_start: weekStart,
      status: decision.status,
      scheduled_date: decision.date,
      scheduled_time: decision.startTime,
      slot: slotBySessionId.get(decision.sessionId) ?? "unspecified",
      origin_date: decision.originDate,
      origin_time: decision.originTime,
      reason: decision.reason,
      incident_id: decision.incidentId,
      previous_placement_id: existingBySessionId.get(decision.sessionId)?.id ?? null,
      ruleset_version: rulesetVersion,
      guardrails_checked: decision.guardrailsChecked,
    };
  });

  const { error: insertError } = await admin.from("session_placements").insert(rows);
  if (insertError) throw new Error(`materializeSessionPlacements: session_placements (insert) — ${insertError.message}`);

  const now = new Date().toISOString();
  await Promise.all(
    decisions.map((decision) => {
      const existing = existingBySessionId.get(decision.sessionId);
      if (!existing) return Promise.resolve();
      const newId = newPlacementIdBySessionId.get(decision.sessionId)!;
      return admin
        .from("session_placements")
        .update({ superseded_at: now, superseded_by_placement_id: newId })
        .eq("id", existing.id)
        .then(({ error }) => {
          if (error) throw new Error(`materializeSessionPlacements: session_placements (supersession) — ${error.message}`);
        });
    }),
  );

  return newPlacementIdBySessionId;
}
