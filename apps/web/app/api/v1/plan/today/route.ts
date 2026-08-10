import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { TodayPlanResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { PaywallRequiredError, requireEntitlement } from "@/lib/entitlements";
import { fetchActivePainNotice, fetchTodayNutritionView, fetchTodaySessionView, getActivePlanVersionId } from "@/lib/orchestration/read-today-plan";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/plan/today` — AC1, AC9, AC13 (`08-architecture.md` §6.3). Accès libre plafonné :
 * `requireEntitlement()` s'exécute AVANT toute lecture de contenu (§3.3) et écrit
 * `free_access_events` si `tier = 'free'` (ADR-008). `no-store` : la réponse dépend du quota tel
 * qu'il vient d'être consommé à CETTE requête précise, jamais mise en cache.
 */
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const surfaceParam = new URL(request.url).searchParams.get("surface");
  const surface = surfaceParam === "dashboard" ? "dashboard" : "today";

  const admin = createSupabaseServiceRoleClient();

  try {
    const entitlement = await requireEntitlement(admin, { userId: user.id, now, surface });

    const [activePainNotice, planVersionId] = await Promise.all([
      fetchActivePainNotice(admin, user.id),
      getActivePlanVersionId(admin, user.id),
    ]);

    const [session, nutrition] = planVersionId
      ? await Promise.all([
          fetchTodaySessionView(admin, { userId: user.id, planVersionId, date: now }),
          fetchTodayNutritionView(admin, { userId: user.id, planVersionId, date: now }),
        ])
      : [null, null];

    const body: TodayPlanResponse = { date: now, session, nutrition, activePainNotice, entitlement };
    return apiJson<TodayPlanResponse>(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PaywallRequiredError) {
      // AC9, ADR-008 §5 — le référentiel douleur ne se retrouve JAMAIS derrière le paywall, même
      // quand le reste du contenu du jour est bloqué : porté dans `details` du 402.
      const activePainNotice = await fetchActivePainNotice(admin, user.id);
      return apiError(402, "PAYWALL_REQUIRED", error.message, { activePainNotice, entitlement: error.entitlement });
    }
    throw error;
  }
}
