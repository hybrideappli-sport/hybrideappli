import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { AcknowledgeReviewResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/plan/reviews/:diffId/acknowledge` — AC5. N'écrit QUE `acknowledged_at`
 * (`docs/db-schema.md` §5 : `plan_diffs` n'accorde `UPDATE` qu'au niveau de cette seule colonne à
 * `authenticated`) ; utilisé ici avec le client `service_role` pour ne dépendre d'aucune session
 * particulière côté RLS, la propriété (`user_id = auth.uid()`) étant déjà vérifiée explicitement
 * ci-dessous.
 */
export async function POST(_request: Request, context: { params: Promise<{ diffId: string }> }) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { diffId } = await context.params;
  const admin = createSupabaseServiceRoleClient();

  const { data: diffRow, error: lookupError } = await admin.from("plan_diffs").select("id, user_id, acknowledged_at").eq("id", diffId).maybeSingle();
  if (lookupError) return apiError(500, "INTERNAL_ERROR", lookupError.message);
  if (!diffRow || diffRow.user_id !== user.id) return apiError(404, "NOT_FOUND", "Révision introuvable.");

  const acknowledgedAt = diffRow.acknowledged_at ?? new Date().toISOString();
  if (!diffRow.acknowledged_at) {
    const { error: updateError } = await admin.from("plan_diffs").update({ acknowledged_at: acknowledgedAt }).eq("id", diffId);
    if (updateError) return apiError(500, "INTERNAL_ERROR", updateError.message);
  }

  const body: AcknowledgeReviewResponse = { acknowledgedAt };
  return apiJson<AcknowledgeReviewResponse>(body);
}
