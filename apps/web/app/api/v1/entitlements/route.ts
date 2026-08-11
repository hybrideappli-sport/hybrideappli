import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { EntitlementView } from "@hybride/domain";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";
import { getEntitlement } from "@/lib/entitlements";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/entitlements` — `08-architecture.md` §6.6. Lecture SEULE, ne consomme jamais
 * d'accès libre (contrairement à `GET /plan/today`) : c'est la route que l'UI interroge pour
 * afficher le compteur d'accès (`FreeAccessMeter`) ou décider d'un `PaywallGate` SANS déclencher de
 * consommation de quota par le simple fait de rafraîchir l'écran. Non listée explicitement dans les
 * étapes du plan (§6, Lot L4), ajoutée car directement nécessaire aux composants Dashboard de ce
 * même lot — voir le rapport de fin de lot.
 */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const { data: profileRow } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const now = todayInTimezone(profileRow?.timezone ?? "Europe/Paris");

  const admin = createSupabaseServiceRoleClient();
  const entitlement = await getEntitlement(admin, { userId: user.id, now });
  return apiJson<EntitlementView>(entitlement, { headers: { "Cache-Control": "no-store" } });
}
