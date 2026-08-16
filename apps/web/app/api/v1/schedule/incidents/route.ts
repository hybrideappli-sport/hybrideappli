import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import { ReportIncidentInputSchema, type ReportIncidentResponse } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { nowPartsInTimezone } from "@/lib/orchestration/today-in-timezone";
import { resolveScheduleIncident } from "@/lib/planning/resolve-schedule-incident";

export const dynamic = "force-dynamic";

/**
 * `POST /api/v1/schedule/incidents` — AC3, AC4, AC6 (`08-architecture.md` §14.5). Entrée
 * `{ plannedSessionId }` et RIEN d'autre (décision du fondateur du 2026-08-11 : bouton, pas
 * formulaire). Résout le replacement de façon SYNCHRONE — la réponse EST le retour UI.
 *
 * **`requireEntitlement()` n'est jamais appelé** : le signalement d'imprévu reste en accès libre,
 * qu'il soit `free` ou `premium` (AC6, ADR-008 §5 étendu — gérer sa journée/un imprévu ne consomme
 * jamais d'accès libre, seule la vue semaine complète est premium).
 */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_FAILED", "Corps de requête JSON invalide.");
  }
  const parsed = ReportIncidentInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_FAILED", "`plannedSessionId` (uuid) est requis, et lui seul.", parsed.error.flatten());
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = nowPartsInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const ruleset = await getActiveRuleset(admin);

  const outcome = await resolveScheduleIncident(admin, { userId: user.id, plannedSessionId: parsed.data.plannedSessionId, now, ruleset });

  switch (outcome.kind) {
    case "not_found":
      return apiError(404, "NOT_FOUND", "Séance introuvable.");
    case "not_reportable":
      return apiError(
        409,
        "SESSION_NOT_REPORTABLE",
        "Cette séance ne peut plus être signalée — déjà passée, déjà annulée, ou trop proche de son horaire (préavis minimal).",
      );
    case "placement_failed":
      return apiError(500, "PLACEMENT_FAILED", "Le replacement n'a pas pu être calculé. Réessayer.", { detail: outcome.message });
    case "already_resolved":
    case "resolved":
      // `cancelled_week` est une sortie NOMINALE, jamais un 4xx (même doctrine que `status:
      // 'calibration'`, §14.5) — une impossibilité expliquée n'est pas une panne.
      return apiJson<ReportIncidentResponse>(outcome.response, { headers: { "Cache-Control": "no-store" } });
  }
}
