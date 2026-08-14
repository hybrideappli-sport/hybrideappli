import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { DataOverviewView } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { fetchDataOverview } from "@/lib/data/fetch-data-overview";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/data/overview` — AC6. Les 4 cellules de `D-data-card`, leurs glyphes de provenance,
 * le résumé de sources et l'état de synchronisation. `regime = 'cold'` ⇒ toutes les cellules à
 * `null` (« — »), jamais une erreur : AC9, aucune dépendance dure à une source connectée.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();

  try {
    const body: DataOverviewView = await fetchDataOverview(admin, { userId: user.id, now });
    return apiJson(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[data/overview] échec pour user=${user.id} : ${message}`);
    return apiError(500, "INTERNAL_ERROR", "Le résumé des données n'a pas pu être chargé.");
  }
}
