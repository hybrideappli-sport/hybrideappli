import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { HybridScoreResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { computeAndStoreHybridScore } from "@/lib/score/compute-and-store-hybrid-score";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/score/hybrid` — AC7, AC8, AC9 (`08-architecture.md` §13.3). Calcul PARESSEUX et
 * IDEMPOTENT (ADR-014 §5) : ne dépend d'aucune source connectée (AC9 — un utilisateur 100 %
 * déclaratif obtient exactement la même réponse). `no-store` : le score dépend de la dernière
 * saisie, jamais mis en cache.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();

  try {
    const body = await computeAndStoreHybridScore(admin, { userId: user.id, now });
    return apiJson<HybridScoreResponse>(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[score/hybrid] échec du calcul pour user=${user.id} : ${message}`);
    return apiError(500, "INTERNAL_ERROR", "Le score hybride n'a pas pu être calculé.");
  }
}
