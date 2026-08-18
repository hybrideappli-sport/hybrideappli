import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { enqueueWeeklyReviews } from "@/lib/jobs/enqueue-weekly-reviews";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/api/v1/cron/enqueue-weekly-reviews` — cron HORAIRE
 * (`.github/workflows/cron-enqueue-weekly-reviews.yml`, ADR-011 §1). Route interne décrite `POST`
 * par `08-architecture.md` §6.8 : conservé pour un rejeu manuel/un test. Exposée aussi en `GET`,
 * seule méthode que le workflow GitHub Actions planifié invoque réellement (déclenchement `curl -X
 * GET`, voir le workflow). Les deux méthodes partagent la même garde `CRON_SECRET` — jamais un
 * accès anonyme, quelle que soit la méthode.
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const result = await enqueueWeeklyReviews(admin);
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
