import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { getActiveRuleset } from "../orchestration/get-active-ruleset";
import { getActivePlanVersionId } from "../orchestration/read-today-plan";
import { nowPartsInTimezone } from "../orchestration/today-in-timezone";
import { placeAndMaterializeVersion } from "../planning/place-plan-version";

/**
 * Handler du job `refresh_placements` (AC2) — déclenché par le trigger de base
 * `availability_slots_refresh_placements` (`docs/db-schema.md` §11.4), enrôlé sans code applicatif
 * à chaque écriture directe client sur `availability_slots` (policy `for all`, hors route serveur).
 * Recalcule TOUTES les semaines de la version active — `availability_changed` gèle les séances déjà
 * passées / à moins de `min_lead_time_min` (`buildPlacementInputForWeek`), redécide les autres.
 */
export async function runRefreshPlacements(admin: SupabaseClient<Database>, args: { userId: string }): Promise<void> {
  const { userId } = args;

  const planVersionId = await getActivePlanVersionId(admin, userId);
  if (!planVersionId) return; // aucun plan actif — rien à recalculer (ex. avant la fin de l'onboarding)

  const { data: profileRow } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  const now = nowPartsInTimezone(profileRow?.timezone ?? "Europe/Paris");
  const ruleset = await getActiveRuleset(admin);

  await placeAndMaterializeVersion(admin, { userId, planVersionId, now, triggerReason: "availability_changed", ruleset });
}
