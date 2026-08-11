import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { ObjectiveEndProposalView, ObjectiveEndResponse } from "@hybride/domain";

import { getLlmProvider } from "../coach-llm-provider";
import { decisionTraceRowToTrace } from "./run-objective-check";
import { renderExplanationForTraces } from "./render-explanations";

export class NoActivePlanForObjectiveEndError extends Error {}

/**
 * AC14 — lecture partagée entre `GET /api/v1/objectives/current/end-offer` et l'écran de
 * transition (`/objectif/fin`). Voir la route pour le détail des garanties (rendu à la lecture,
 * jamais de génération silencieuse de plan vide).
 */
export async function readObjectiveEndOffer(admin: SupabaseClient<Database>, userId: string): Promise<ObjectiveEndResponse> {
  const { data: activePlan, error: planError } = await admin
    .from("plans")
    .select("objective_id, current_version_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (planError) throw new Error(`readObjectiveEndOffer: plans — ${planError.message}`);
  if (!activePlan) {
    throw new NoActivePlanForObjectiveEndError("readObjectiveEndOffer: aucun plan actif.");
  }

  const { data: objective, error: objectiveError } = await admin
    .from("objectives")
    .select("id, status, target_date")
    .eq("id", activePlan.objective_id)
    .single();
  if (objectiveError) throw new Error(`readObjectiveEndOffer: objectives — ${objectiveError.message}`);

  if (objective.status !== "expired") {
    return { status: "active", objectiveId: objective.id };
  }

  const proposals: ObjectiveEndProposalView[] = [
    {
      kind: "new_objective",
      label: "Définir un nouvel objectif",
      rationale: "Ton coach reprend une conversation guidée pour cadrer un nouvel objectif adapté à ta progression actuelle.",
    },
    {
      kind: "transition_recovery",
      label: "Continuer en transition / récupération encadrée",
      rationale: "Ton plan actuel a déjà basculé automatiquement sur une phase de transition/récupération — tu peux la suivre telle quelle.",
    },
  ];

  let explanation: { short: string; long: string | null } = {
    short: "La date cible de ton objectif est dépassée : ton coach a préparé une phase de transition plutôt que de laisser un vide dans ton plan.",
    long: null,
  };

  if (activePlan.current_version_id) {
    const { data: traceRow, error: traceError } = await admin
      .from("decision_traces")
      .select("id, rule_id, rule_version, ruleset_version, category, is_hard_guardrail, scope, scope_ref_id, scope_ref_date, condition_expr, inputs_used, output, severity")
      .eq("plan_version_id", activePlan.current_version_id)
      .eq("rule_id", "objective_end.offer")
      .limit(1)
      .maybeSingle();
    if (traceError) throw new Error(`readObjectiveEndOffer: decision_traces — ${traceError.message}`);

    if (traceRow) {
      const rendered = await renderExplanationForTraces(getLlmProvider(), {
        subjectType: "objective_feasibility",
        traces: [decisionTraceRowToTrace(traceRow)],
      });
      explanation = { short: rendered.shortText, long: rendered.longText };
    }
  }

  return { status: "ended", objectiveId: objective.id, targetDate: objective.target_date!, explanation, proposals };
}
