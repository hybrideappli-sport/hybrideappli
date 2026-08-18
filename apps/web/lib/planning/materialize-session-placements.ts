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
 *
 * Finding (couverture de test Lot F2/F3 I5) : la supersession doit être écrite AVANT l'insertion de
 * la nouvelle ligne, jamais après. `session_placements_current` est un index unique PARTIEL sur
 * `(planned_session_id) where superseded_at is null` — sur les deux appelants qui redécident des
 * séances DÉJÀ placées (`resolveScheduleIncident()`, et le job `refresh_placements` via
 * `triggerReason: 'availability_changed'`), la ligne courante existe encore au moment de l'insert :
 * insérer avant de superséder viole systématiquement cette contrainte (`duplicate key value…`), et
 * ces deux chemins échouaient donc à 100 % avant correction — jamais atteint par aucun test jusque
 * là. `regeneratePlan()` (séances FRAÎCHES, aucun placement existant pour ces ids) n'est pas
 * concerné, ce qui explique que le bug soit resté invisible.
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

  const now = new Date().toISOString();
  const existingIdsToSupersede = decisions.map((d) => existingBySessionId.get(d.sessionId)?.id).filter((id): id is string => id !== undefined);

  // 1) Supersession D'ABORD (voir en-tête), SANS `superseded_by_placement_id` pour l'instant — la
  // ligne qu'elle doit référencer n'existe pas encore, et `superseded_by_placement_id_fkey`
  // l'interdirait. Libère `session_placements_current` pour l'insertion ci-dessous.
  // `.is("superseded_at", null)` garde cet UPDATE idempotent : sans elle, un retry ou une course
  // réécrirait inconditionnellement `superseded_at` sur une ligne déjà supersédée par un appel
  // concurrent.
  if (existingIdsToSupersede.length > 0) {
    const { error: supersedeError } = await admin
      .from("session_placements")
      .update({ superseded_at: now })
      .in("id", existingIdsToSupersede)
      .is("superseded_at", null);
    if (supersedeError) throw new Error(`materializeSessionPlacements: session_placements (supersession) — ${supersedeError.message}`);
  }

  // 2) Insertion des nouvelles lignes courantes — `session_placements_current` est maintenant libre.
  const { error: insertError } = await admin.from("session_placements").insert(rows);
  if (insertError) throw new Error(`materializeSessionPlacements: session_placements (insert) — ${insertError.message}`);

  // 3) Rattache chaque ancienne ligne à celle qui l'a remplacée, maintenant qu'elle existe.
  await Promise.all(
    decisions.map((decision) => {
      const existing = existingBySessionId.get(decision.sessionId);
      if (!existing) return Promise.resolve();
      const newId = newPlacementIdBySessionId.get(decision.sessionId)!;
      return admin
        .from("session_placements")
        .update({ superseded_by_placement_id: newId })
        .eq("id", existing.id)
        .then(({ error }) => {
          if (error) throw new Error(`materializeSessionPlacements: session_placements (rattachement) — ${error.message}`);
        });
    }),
  );

  return newPlacementIdBySessionId;
}
