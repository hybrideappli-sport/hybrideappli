import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { WeekPlanResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { startOfIsoWeekIso } from "@/lib/dates";
import { getEntitlement } from "@/lib/entitlements";
import { getActivePlanVersionId } from "@/lib/orchestration/read-today-plan";
import { fetchWeekPlan } from "@/lib/orchestration/read-plan-week-macro";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `GET /api/v1/plan/week?weekStart=` (AC1, AC13, `08-architecture.md` §6.3, finding B4) — vue
 * semaine complète, réservée aux abonnés. `weekStart` doit être un lundi (`plan_weeks.week_start`) ;
 * omis, il vaut le début de la semaine ISO courante. Ne consomme jamais d'accès libre
 * (`getEntitlement()`, pas `requireEntitlement()` — même principe que `/plan/reviews/latest`).
 */
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const entitlement = await getEntitlement(admin, { userId: user.id, now });
  if (!entitlement.canViewWeek) {
    return apiError(402, "PAYWALL_REQUIRED", "La vue semaine complète est réservée aux abonnés.", { entitlement });
  }

  const weekStartParam = new URL(request.url).searchParams.get("weekStart");
  const weekStart = weekStartParam && ISO_DATE.test(weekStartParam) ? weekStartParam : startOfIsoWeekIso(now);

  const planVersionId = await getActivePlanVersionId(admin, user.id);
  if (!planVersionId) return apiError(409, "CONFLICT", "Aucun plan actif — termine l'onboarding avant de consulter ta semaine.");

  const week = await fetchWeekPlan(admin, { userId: user.id, planVersionId, weekStart });
  if (!week) return apiError(404, "NOT_FOUND", "Aucune semaine planifiée pour cette date.");

  return apiJson<WeekPlanResponse>(week, { headers: { "Cache-Control": "no-store" } });
}
