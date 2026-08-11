import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { drainJobs } from "@/lib/jobs/drain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** ADR-011 §7 — budget explicite : une révision hebdomadaire complète (contexte + moteur +
 * matérialisation + diff + LLM) compte quelques secondes ; le lot est dimensionné pour rester
 * sous ce budget avec marge (`DRAIN_BATCH_SIZE`). */
export const maxDuration = 60;

const DRAIN_BATCH_SIZE = 10;

/**
 * `/api/v1/cron/drain-jobs` — cron toutes les 5 min (`vercel.json`, ADR-011 §3). `GET` + `POST`,
 * voir `enqueue-weekly-reviews/route.ts` pour le détail (Vercel Cron invoque en `GET`).
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const summary = await drainJobs(admin, DRAIN_BATCH_SIZE);
  return apiJson(summary, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
