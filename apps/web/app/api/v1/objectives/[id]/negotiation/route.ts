import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { NegotiationDecisionSchema } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { negotiateObjective, ObjectiveNotFoundError, ProposalNotFoundError } from "@/lib/orchestration/negotiate-objective";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/objectives/:id/negotiation` (AC2) — l'utilisateur accepte une proposition du
 * moteur ou confirme son objectif initial en connaissance de cause (`canKeepOriginal`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: objectiveId } = await params;
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = NegotiationDecisionSchema.safeParse(rawBody);
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Décision de négociation invalide.", parsed.error.issues);
  if (parsed.data.decision === "accept_proposal" && !parsed.data.proposalId) {
    return apiError(400, "VALIDATION_FAILED", "`proposalId` requis pour accepter une proposition.");
  }

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const timezone = profileRow?.timezone ?? "Europe/Paris";

  const admin = createSupabaseServiceRoleClient();

  try {
    const result = await negotiateObjective(admin, { userId: user.id, objectiveId, decision: parsed.data, timezone });
    return apiJson(result);
  } catch (error) {
    if (error instanceof ObjectiveNotFoundError) return apiError(404, "NOT_FOUND", error.message);
    if (error instanceof ProposalNotFoundError) return apiError(400, "VALIDATION_FAILED", error.message);
    throw error;
  }
}
