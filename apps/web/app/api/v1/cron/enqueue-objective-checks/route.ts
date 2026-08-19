import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { DRAIN_BATCH_SIZE, drainJobsBestEffort } from "@/lib/jobs/drain";
import { enqueueObjectiveChecks } from "@/lib/jobs/enqueue-objective-checks";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Aligné sur `drain-jobs/route.ts` (ADR-011 §7) — le drain synchrone qui suit l'enrôlement peut
 * exécuter jusqu'à `DRAIN_BATCH_SIZE` jobs dans la même invocation. */
export const maxDuration = 60;

/**
 * `/api/v1/cron/enqueue-objective-checks` — Vercel Cron QUOTIDIEN (`apps/web/vercel.json`, AC14).
 * `GET` + `POST`, voir `enqueue-weekly-reviews/route.ts` pour le détail (Vercel Cron invoque en
 * `GET`), même drain synchrone best-effort après l'enrôlement (ADR-011, mise à jour).
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const now = todayInTimezone("UTC");
  const result = await enqueueObjectiveChecks(admin, now);
  await drainJobsBestEffort(admin, DRAIN_BATCH_SIZE, "enqueue-objective-checks");
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
