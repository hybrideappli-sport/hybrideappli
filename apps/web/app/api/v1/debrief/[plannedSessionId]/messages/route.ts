import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { z } from "zod";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { DebriefSessionNotFoundError, runDebriefTurnForSession } from "@/lib/orchestration/run-debrief-turn";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ content: z.string().trim().min(1).max(2000) });

/**
 * `POST /api/v1/debrief/:plannedSessionId/messages` — un tour de débrief post-séance
 * (US-05, Lot L1, ADR-019).
 *
 * Ne consomme PAS d'accès libre, comme `POST /session-logs` : recueillir ce qui s'est passé n'est
 * pas consommer du contenu (ADR-008 §5).
 *
 * Portée du Lot L1 : la réponse est un JSON simple, pas un flux SSE comme
 * `/onboarding/session/:id/messages`. Le streaming est une question d'écran, tranchée au Lot L3
 * quand l'UI existera — l'imposer ici compliquerait une route que seuls des tests appellent.
 *
 * Aucune écriture dans `session_logs` : voir `run-debrief-turn.ts`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ plannedSessionId: string }> }) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { plannedSessionId } = await params;
  if (!z.string().uuid().safeParse(plannedSessionId).success) {
    return apiError(400, "VALIDATION_FAILED", "Identifiant de séance invalide.");
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "VALIDATION_FAILED", "Message invalide.", parsed.error.flatten());

  const admin = createSupabaseServiceRoleClient();
  try {
    const turn = await runDebriefTurnForSession(admin, {
      userId: user.id,
      plannedSessionId,
      userMessage: parsed.data.content,
    });
    return apiJson({
      debriefSessionId: turn.debriefSessionId,
      reply: turn.reply,
      isReformulation: turn.isReformulation,
      missingMandatory: turn.missingMandatory,
      missingDesired: turn.missingDesired,
      canClose: turn.canClose,
      reachedTurnLimit: turn.reachedTurnLimit,
    });
  } catch (error) {
    if (error instanceof DebriefSessionNotFoundError) return apiError(404, "NOT_FOUND", "Séance introuvable.");
    throw error;
  }
}
