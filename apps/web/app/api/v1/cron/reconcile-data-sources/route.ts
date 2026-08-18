import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { enqueueReconcileDataSources } from "@/lib/jobs/enqueue-reconcile-data-sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * `/api/v1/cron/reconcile-data-sources` — filet quotidien (ADR-013 §1, `08-architecture.md` §13.4) :
 * enrôle `strava_reconcile` pour chaque connexion active, exécuté ensuite par `drain-jobs`. `GET` +
 * `POST` — le workflow GitHub Actions (`.github/workflows/cron-reconcile-data-sources.yml`) invoque
 * en `GET` (voir `enqueue-weekly-reviews/route.ts`).
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const summary = await enqueueReconcileDataSources(admin);
  return apiJson(summary, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
