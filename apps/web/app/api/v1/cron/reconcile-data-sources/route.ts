import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { DRAIN_BATCH_SIZE, drainJobsBestEffort } from "@/lib/jobs/drain";
import { enqueueReconcileDataSources } from "@/lib/jobs/enqueue-reconcile-data-sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * `/api/v1/cron/reconcile-data-sources` — filet quotidien (ADR-013 §1, `08-architecture.md` §13.4) :
 * enrôle `strava_reconcile` pour chaque connexion active. `GET` + `POST` — Vercel Cron
 * (`apps/web/vercel.json`) invoque en `GET` (voir `enqueue-weekly-reviews/route.ts`). Drain
 * synchrone best-effort après l'enrôlement (ADR-011, mise à jour) : traite immédiatement ce qui
 * vient d'être mis en file plutôt que d'attendre le prochain passage quotidien de `/cron/drain-jobs`.
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const summary = await enqueueReconcileDataSources(admin);
  await drainJobsBestEffort(admin, DRAIN_BATCH_SIZE, "reconcile-data-sources");
  return apiJson(summary, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
