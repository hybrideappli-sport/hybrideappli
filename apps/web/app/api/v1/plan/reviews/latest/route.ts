import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { PlanDiffView } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getEntitlement } from "@/lib/entitlements";
import { readLatestPlanDiff } from "@/lib/orchestration/read-plan-diff";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/plan/reviews/latest` — AC5. Réservé aux abonnés (`08-architecture.md` §6.3) : la
 * révision hebdomadaire COMPLÈTE (diff, raisonnement détaillé) n'est jamais servie en accès libre,
 * au même titre que la vue semaine — seul le plan du jour l'est (AC13). Ne consomme jamais d'accès
 * libre (`getEntitlement()`, pas `requireEntitlement()`).
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const entitlement = await getEntitlement(admin, { userId: user.id, now });
  if (!entitlement.canViewWeek) {
    return apiError(402, "PAYWALL_REQUIRED", "La révision hebdomadaire complète est réservée aux abonnés.", { entitlement });
  }

  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (planError) return apiError(500, "INTERNAL_ERROR", planError.message);
  if (!plan) return apiError(409, "CONFLICT", "Aucun plan actif — termine l'onboarding avant de consulter tes révisions.");

  const diff = await readLatestPlanDiff(admin, plan.id);
  if (!diff) return apiError(404, "NOT_FOUND", "Aucune révision hebdomadaire disponible pour le moment — reviens dimanche soir.");

  return apiJson<PlanDiffView>(diff, { headers: { "Cache-Control": "no-store" } });
}
