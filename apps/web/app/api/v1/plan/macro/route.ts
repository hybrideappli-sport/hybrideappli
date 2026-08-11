import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { MacroPlanResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getEntitlement } from "@/lib/entitlements";
import { fetchMacroPlan } from "@/lib/orchestration/read-plan-week-macro";
import { getActivePlanVersionId } from "@/lib/orchestration/read-today-plan";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/plan/macro` (AC1, AC13, `08-architecture.md` §6.3, finding B4) — vision macro par
 * blocs jusqu'à l'objectif, réservée aux abonnés. Ne consomme jamais d'accès libre.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const entitlement = await getEntitlement(admin, { userId: user.id, now });
  if (!entitlement.canViewMacro) {
    return apiError(402, "PAYWALL_REQUIRED", "La vision macro par blocs est réservée aux abonnés.", { entitlement });
  }

  const planVersionId = await getActivePlanVersionId(admin, user.id);
  if (!planVersionId) return apiError(409, "CONFLICT", "Aucun plan actif — termine l'onboarding avant de consulter ta vision macro.");

  const macro = await fetchMacroPlan(admin, { planVersionId });
  return apiJson<MacroPlanResponse>(macro, { headers: { "Cache-Control": "no-store" } });
}
