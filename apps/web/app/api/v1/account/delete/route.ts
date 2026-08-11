import { z } from "zod";
import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({ confirm: z.literal(true) });

/**
 * `POST /api/v1/account/delete` (art. 17 RGPD, `08-architecture.md` §6.7, ADR-010 §8) — appelle
 * `erase_account(uuid)` en `service_role` : suppression RÉELLE en cascade de toutes les données
 * personnelles (`delete from auth.users` déclenche la cascade FK sur les 30+ tables qui la
 * référencent), à l'exception du registre `consents`, conservé pseudonymisé (preuve du
 * consentement recueilli, ADR-010 §8, rétention 5 ans).
 *
 * `{ confirm: true }` obligatoire dans le corps : barrière minimale côté API contre un appel
 * accidentel (rejeu de requête, extension de navigateur). La « confirmation forte » exigée par
 * l'architecture est portée côté UI (`/compte`) : ressaisie de l'e-mail du compte avant d'activer
 * le bouton de suppression — cette route ne fait qu'appliquer la décision une fois confirmée.
 */
export async function POST(request: Request) {
  const { user } = await requireUser();
  if (!user) return apiError(401, "UNAUTHORIZED", "Authentification requise.");

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_FAILED", "Confirmation explicite requise (`{ confirm: true }`).", parsed.error.issues);
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc("erase_account", { p_user: user.id });
  if (error) return apiError(500, "INTERNAL_ERROR", `erase_account: ${error.message}`);

  return apiJson(data);
}
