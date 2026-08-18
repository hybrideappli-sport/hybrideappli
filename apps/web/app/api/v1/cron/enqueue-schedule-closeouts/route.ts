import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { enqueueScheduleCloseouts } from "@/lib/jobs/enqueue-schedule-closeouts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/api/v1/cron/enqueue-schedule-closeouts` — cron HORAIRE
 * (`.github/workflows/cron-enqueue-schedule-closeouts.yml`, ADR-017 §1). Même patron que
 * `/cron/enqueue-weekly-reviews` : `GET` (workflow GitHub Actions) et `POST` (rejeu manuel), même
 * garde `CRON_SECRET` fail-closed pour les deux méthodes.
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const result = await enqueueScheduleCloseouts(admin);
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
