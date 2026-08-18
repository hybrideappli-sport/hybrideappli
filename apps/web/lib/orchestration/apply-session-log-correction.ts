import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { UpdateSessionLogInput, UpdateSessionLogResponse } from "@hybride/domain";

import { runSessionLogSignalPipeline, SessionLogPersistenceError } from "./run-session-log-signal-pipeline";

export { SessionLogPersistenceError };

export class SessionLogNotFoundError extends Error {}

/**
 * `applySessionLogCorrection()` — `PATCH /session-logs/:id` (F3, `11-design-notes.md` §3.3,
 * amendement ADR-017 §9). Pendant exact d'`applyDailyLog()` pour une ligne DÉJÀ persistée : seule
 * la persistance change (`UPDATE` au lieu d'`INSERT`, uniquement les champs fournis) — tout ce qui
 * suit (charge réalisée, réconciliation, score, protocole douleur, ajustement) est
 * `runSessionLogSignalPipeline()`, partagé à l'identique avec `applyDailyLog()`.
 *
 * ADR-015 « Conséquences » : une correction sur une ligne déjà EXCLUE (perdante d'une fusion, AC5)
 * ne redevient pas portante — elle REJOUE son enrichissement vers la ligne qui l'a absorbée
 * (`reconciliationMode: "replay-if-excluded"`, sans condition : la fonction sous-jacente est un
 * no-op silencieux si la ligne n'est pas exclue).
 */
export async function applySessionLogCorrection(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; logId: string; input: UpdateSessionLogInput },
): Promise<UpdateSessionLogResponse> {
  const { userId, now, logId, input } = args;

  const { data: existing, error: existingError } = await admin
    .from("session_logs")
    .select("id, user_id")
    .eq("id", logId)
    .maybeSingle();
  if (existingError) throw new Error(`applySessionLogCorrection: lecture session_logs — ${existingError.message}`);
  if (!existing || existing.user_id !== userId) throw new SessionLogNotFoundError(`applySessionLogCorrection: séance ${logId} introuvable pour l'utilisateur ${userId}.`);

  // 1) Mise à jour du réalisé — client RLS (policy `session_logs_update_own`, consentement santé
  // vérifié en profondeur, ADR-010 §2). Seuls les champs FOURNIS sont écrits — un `PATCH` partiel
  // ne doit jamais réinitialiser un champ non soumis.
  const updatePayload: Database["public"]["Tables"]["session_logs"]["Update"] = {};
  if (input.completion !== undefined) updatePayload.completion = input.completion;
  if (input.notDoneReason !== undefined) updatePayload.not_done_reason = input.notDoneReason;
  if (input.actualDurationMin !== undefined) updatePayload.actual_duration_min = input.actualDurationMin;
  if (input.rpe !== undefined) updatePayload.rpe = input.rpe;
  if (input.freshness !== undefined) updatePayload.freshness = input.freshness;
  if (input.pain !== undefined) updatePayload.pain = input.pain;
  if (input.painZone !== undefined) updatePayload.pain_zone = input.painZone;
  if (input.painAtRest !== undefined) updatePayload.pain_at_rest = input.painAtRest;
  if (input.comment !== undefined) updatePayload.comment = input.comment;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await rls.from("session_logs").update(updatePayload).eq("id", logId);
    if (updateError) throw new SessionLogPersistenceError(`applySessionLogCorrection: session_logs — ${updateError.message}`);
  }

  // Les signaux transmis au pipeline (protocole douleur, asymétrie de charge) reflètent l'état FINAL
  // en base — pas seulement le corps du `PATCH` — pour rester corrects même sur une mise à jour
  // partielle (ex. seul `completion` fourni, `pain` déjà posé par une saisie précédente).
  const { data: finalRow, error: finalRowError } = await admin.from("session_logs").select("rpe, freshness, pain, pain_zone").eq("id", logId).single();
  if (finalRowError) throw new Error(`applySessionLogCorrection: relecture session_logs — ${finalRowError.message}`);

  const pipelineResult = await runSessionLogSignalPipeline(admin, {
    userId,
    now,
    logId,
    reconciliationMode: "replay-if-excluded",
    signals: { rpe: finalRow.rpe, freshness: finalRow.freshness, pain: finalRow.pain, painZone: finalRow.pain_zone },
  });

  return { logId, ...pipelineResult };
}
