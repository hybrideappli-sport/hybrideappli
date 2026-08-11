import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { ObjectiveEndResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { NoActivePlanForObjectiveEndError, readObjectiveEndOffer } from "@/lib/orchestration/read-objective-end-offer";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/objectives/current/end-offer` — AC14. Lit l'état déjà produit par
 * `runObjectiveCheck()` (cron quotidien, `apps/web/lib/orchestration/run-objective-check.ts`) :
 * l'objectif actif de l'utilisateur est-il `expired` (date cible dépassée, plan de transition déjà
 * matérialisé) ? Si oui, assemble les DEUX propositions explicites d'AC14 (jamais un vide).
 */
export async function GET() {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();
  try {
    const body = await readObjectiveEndOffer(admin, user.id);
    return apiJson<ObjectiveEndResponse>(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NoActivePlanForObjectiveEndError) {
      return apiError(409, "CONFLICT", "Aucun plan actif — termine l'onboarding avant de consulter ton objectif.");
    }
    throw error;
  }
}
