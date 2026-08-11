import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { DecisionTrace } from "@hybride/domain";

import { notifyUser } from "../notifications/notify";
import { regeneratePlan } from "./regenerate-plan";

export class ObjectiveCheckNotFoundError extends Error {}

export interface ObjectiveCheckResult {
  ended: boolean;
  objectiveId: string;
  planVersionId: string | null;
}

/**
 * `runObjectiveCheck()` — AC14. Appelé par `POST /api/v1/cron/drain-jobs` pour chaque job
 * `job_queue.kind = 'objective_check'` (enrôlé quotidiennement par
 * `/cron/enqueue-objective-checks` quand `objectives.target_date <= now`).
 *
 * Le moteur (`@hybride/rules-engine`, pipeline étape 4, `packages/rules-engine/src/pipeline/
 * 04-build-macro-blocks.ts`) garantit DÉJÀ qu'un plan `trigger = 'objective_end'` n'est jamais
 * vide : premier bloc `transition`/`recovery`, trace `objective_end.offer` explicite. Ce module
 * assemble la réaction produit autour de cette garantie : régénère le plan (jamais un vide,
 * `regeneratePlan()`), fait basculer `objectives.status = 'expired'` (empêche un rejeu quotidien
 * du même objectif — idempotence complémentaire à `job_queue.idempotency_key`, qui lui n'enrôle
 * qu'UNE FOIS par objectif puisque la clé n'inclut pas de composante temporelle variable), et
 * notifie l'utilisateur. `GET /api/v1/objectives/current/end-offer` lit ensuite l'état pour
 * l'écran de transition (AC14) — voir son en-tête pour le choix de rendu « à la lecture ».
 */
export async function runObjectiveCheck(admin: SupabaseClient<Database>, args: { userId: string; objectiveId: string; now: string }): Promise<ObjectiveCheckResult> {
  const { userId, objectiveId, now } = args;

  const { data: objective, error } = await admin
    .from("objectives")
    .select("id, status, target_date, user_id")
    .eq("id", objectiveId)
    .maybeSingle();
  if (error) throw new Error(`runObjectiveCheck: objectives — ${error.message}`);
  if (!objective || objective.user_id !== userId) {
    throw new ObjectiveCheckNotFoundError(`runObjectiveCheck: objectif ${objectiveId} introuvable pour cet utilisateur.`);
  }

  // Idempotence produit : un objectif déjà `expired` (précédent passage du cron) n'est jamais
  // retraité — `job_queue.idempotency_key` protège l'ENRÔLEMENT, ceci protège l'EFFET si un job
  // était malgré tout rejoué (reprise après panne, ADR-011 §3).
  if (objective.status !== "active" || !objective.target_date || objective.target_date > now) {
    return { ended: false, objectiveId, planVersionId: null };
  }

  const result = await regeneratePlan(admin, { userId, objectiveId, trigger: "objective_end", now });
  if (result.outcome !== "plan_generated") {
    // Ne devrait jamais arriver (`objective_end` ne passe jamais par la bifurcation AC2), défensif.
    return { ended: false, objectiveId, planVersionId: null };
  }

  const { error: updateError } = await admin.from("objectives").update({ status: "expired" }).eq("id", objectiveId);
  if (updateError) throw new Error(`runObjectiveCheck: objectives (expired) — ${updateError.message}`);

  await notifyUser(admin, {
    userId,
    type: "objective_reached",
    title: "Ton objectif est arrivé à échéance",
    body: "Ton coach a préparé une phase de transition — choisis un nouvel objectif ou continue en récupération encadrée.",
    deepLink: "/objectif/fin",
  });

  return { ended: true, objectiveId, planVersionId: result.planVersionId };
}

/** Reconstruit un `DecisionTrace` depuis une ligne `decision_traces` — même schéma que
 * `apps/web/lib/orchestration/run-weekly-review.ts::resolveDiffItemTraces`. */
export function decisionTraceRowToTrace(row: {
  id: string;
  rule_id: string;
  rule_version: string;
  ruleset_version: string;
  category: string;
  is_hard_guardrail: boolean;
  scope: string;
  scope_ref_id: string | null;
  scope_ref_date: string | null;
  condition_expr: string;
  inputs_used: unknown;
  output: unknown;
  severity: string;
}): DecisionTrace {
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleVersion: row.rule_version,
    rulesetVersion: row.ruleset_version,
    category: row.category as DecisionTrace["category"],
    isHardGuardrail: row.is_hard_guardrail,
    scope: row.scope as DecisionTrace["scope"],
    scopeRefId: row.scope_ref_id,
    scopeRefDate: row.scope_ref_date,
    conditionExpr: row.condition_expr,
    inputsUsed: row.inputs_used as unknown as DecisionTrace["inputsUsed"],
    output: row.output as unknown as DecisionTrace["output"],
    severity: row.severity as DecisionTrace["severity"],
  };
}
