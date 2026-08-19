import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { DRAIN_BATCH_SIZE, drainJobs } from "@/lib/jobs/drain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** ADR-011 §7 — budget explicite : une révision hebdomadaire complète (contexte + moteur +
 * matérialisation + diff + LLM) compte quelques secondes ; le lot est dimensionné pour rester
 * sous ce budget avec marge (`DRAIN_BATCH_SIZE`). */
export const maxDuration = 60;

/**
 * `/api/v1/cron/drain-jobs` — Vercel Cron quotidien (`apps/web/vercel.json`, ADR-011 §3) : filet de
 * sécurité qui rattrape les jobs ratés/en échec/abandonnés, le chemin principal de traitement étant
 * désormais le drain synchrone déclenché à l'enrôlement (voir `lib/jobs/drain.ts`). `GET` + `POST`,
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
