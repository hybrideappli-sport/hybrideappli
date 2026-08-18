import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { CreateSessionLogInput, CreateSessionLogResponse } from "@hybride/domain";

import { runSessionLogSignalPipeline, NoActivePlanError, SessionLogPersistenceError } from "./run-session-log-signal-pipeline";

export { NoActivePlanError, SessionLogPersistenceError };

/**
 * `applyDailyLog()` — le 2ᵉ orchestrateur d'`08-architecture.md` §3.2 : saisie post-séance/repas
 * (AC4) → protocole douleur (AC9) → ajustement immédiat SYNCHRONE à la baisse (jamais à la hausse,
 * ADR-005 §5). La persistance (`INSERT`) est propre à cette fonction ; tout ce qui suit (charge
 * réalisée, réconciliation, score, protocole douleur, ajustement, séance suivante) est factorisé
 * dans `runSessionLogSignalPipeline()` — partagé avec `applySessionLogCorrection()` (`PATCH
 * /session-logs/:id`, Lot F3 correction) pour que les deux chemins d'écriture du réalisé se
 * comportent EXACTEMENT de la même façon vis-à-vis d'AC9/AC4.
 */
export async function applyDailyLog(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; now: string; input: CreateSessionLogInput },
): Promise<CreateSessionLogResponse> {
  const { userId, now, input } = args;

  // US-02, AC3 — séance HORS PLAN : `sportCode` (déclaratif, choisi par l'utilisateur dans un
  // référentiel public) est résolu en `sport_id` ICI, avant l'insertion — c'est une colonne
  // GRANTée à `authenticated` (`0019_actuals_data_sources.sql`), à la différence de `load_units`
  // (chemin d'écriture unique, `finalizeSessionLogLoad()`, ADR-015 §1). Un code inconnu du
  // référentiel laisse `sportId` à `null` plutôt que d'échouer bruyamment.
  let sportId: string | null = null;
  if (input.sportCode) {
    const { data: sportRow } = await rls.from("sports").select("id").eq("code", input.sportCode).maybeSingle();
    sportId = sportRow?.id ?? null;
  }

  // 1) Persistance du réalisé — client RLS (consentement santé vérifié en profondeur par la
  // policy `session_logs_insert_own`, pas seulement en amont dans le Route Handler).
  const { data: insertedLog, error: insertError } = await rls
    .from("session_logs")
    .insert({
      user_id: userId,
      planned_session_id: input.plannedSessionId,
      logged_date: input.loggedDate,
      sport_id: sportId,
      session_type: input.sessionType ?? null,
      started_at: input.startedAt ?? null,
      completion: input.completion,
      not_done_reason: input.notDoneReason ?? null,
      actual_duration_min: input.actualDurationMin ?? null,
      rpe: input.rpe ?? null,
      freshness: input.freshness ?? null,
      pain: input.pain,
      pain_zone: input.painZone ?? null,
      pain_at_rest: input.painAtRest ?? false,
      comment: input.comment ?? null,
    })
    .select("id")
    .single();
  if (insertError) throw new SessionLogPersistenceError(`applyDailyLog: session_logs — ${insertError.message}`);

  const pipelineResult = await runSessionLogSignalPipeline(admin, {
    userId,
    now,
    logId: insertedLog.id,
    reconciliationMode: "match",
    signals: { rpe: input.rpe ?? null, freshness: input.freshness ?? null, pain: input.pain, painZone: input.painZone ?? null },
  });

  return { logId: insertedLog.id, ...pipelineResult };
}
