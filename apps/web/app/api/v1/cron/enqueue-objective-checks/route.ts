import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { enqueueObjectiveChecks } from "@/lib/jobs/enqueue-objective-checks";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/api/v1/cron/enqueue-objective-checks` — cron QUOTIDIEN (`vercel.json`, AC14). `GET` + `POST`,
 * voir `enqueue-weekly-reviews/route.ts` pour le détail (Vercel Cron invoque en `GET`).
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const now = todayInTimezone("UTC");
  const result = await enqueueObjectiveChecks(admin, now);
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
