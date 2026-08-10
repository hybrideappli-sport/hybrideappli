import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";
import type { NegotiationDecision } from "@hybride/domain";

import { regeneratePlan, type RegeneratePlanResult } from "./regenerate-plan";
import { todayInTimezone } from "./today-in-timezone";

export class ObjectiveNotFoundError extends Error {}
export class ProposalNotFoundError extends Error {}

/**
 * `POST /api/v1/objectives/:id/negotiation` (AC2) — l'utilisateur accepte une proposition du
 * moteur ou confirme son objectif initial « en connaissance de cause » (`canKeepOriginal`).
 * `objectives.user_decision`/`status`/`target_date`/`target_metric` sont écrits en `service_role` :
 * ce sont des colonnes hors GRANT `authenticated` pour `user_decision`/`status`
 * (`docs/db-schema.md` §2), et la mise à jour de `target_date`/`target_metric` doit être
 * cohérente avec la proposition VALIDÉE côté serveur, jamais un choix libre du client.
 */
export async function negotiateObjective(
  admin: SupabaseClient<Database>,
  args: { userId: string; objectiveId: string; decision: NegotiationDecision; timezone: string },
): Promise<RegeneratePlanResult> {
  const { userId, objectiveId, decision, timezone } = args;

  const { data: objective, error } = await admin
    .from("objectives")
    .select("id, user_id, feasibility, proposed_alternative")
    .eq("id", objectiveId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`negotiateObjective: objectives (lecture) — ${error.message}`);
  if (!objective) throw new ObjectiveNotFoundError(`negotiateObjective: objectif ${objectiveId} introuvable pour cet utilisateur.`);

  if (decision.decision === "accept_proposal") {
    const proposals =
      (objective.proposed_alternative as unknown as { proposals?: Array<{ id: string; targetDate: string; targetMetric: Record<string, unknown> }> } | null)
        ?.proposals ?? [];
    const proposal = proposals.find((p) => p.id === decision.proposalId);
    if (!proposal) {
      throw new ProposalNotFoundError(`negotiateObjective: proposition ${decision.proposalId ?? "(absente)"} introuvable.`);
    }

    const { error: updateError } = await admin
      .from("objectives")
      .update({
        user_decision: "accepted_proposal",
        target_date: proposal.targetDate,
        target_metric: proposal.targetMetric as unknown as Json,
      })
      .eq("id", objectiveId);
    if (updateError) throw new Error(`negotiateObjective: objectives (accept_proposal) — ${updateError.message}`);
  } else {
    // AC2 — « confirmer son objectif initial en connaissance de cause » : aucune valeur
    // déclarative n'est modifiée, seule la décision est tracée.
    const { error: updateError } = await admin.from("objectives").update({ user_decision: "kept_original" }).eq("id", objectiveId);
    if (updateError) throw new Error(`negotiateObjective: objectives (keep_original) — ${updateError.message}`);
  }

  return regeneratePlan(admin, {
    userId,
    objectiveId,
    trigger: "objective_renegotiation",
    now: todayInTimezone(timezone),
  });
}
