import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { DRAIN_BATCH_SIZE, drainJobsBestEffort } from "@/lib/jobs/drain";
import { enqueueScheduleCloseouts } from "@/lib/jobs/enqueue-schedule-closeouts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Aligné sur `drain-jobs/route.ts` (ADR-011 §7) — le drain synchrone qui suit l'enrôlement peut
 * exécuter jusqu'à `DRAIN_BATCH_SIZE` clôtures dans la même invocation. */
export const maxDuration = 60;

/**
 * `/api/v1/cron/enqueue-schedule-closeouts` — Vercel Cron QUOTIDIEN (`apps/web/vercel.json`,
 * ADR-017 §1). Même patron que `/cron/enqueue-weekly-reviews` : `GET` (Vercel Cron) et `POST`
 * (rejeu manuel), même garde `CRON_SECRET` fail-closed pour les deux méthodes, même drain
 * synchrone best-effort après l'enrôlement (ADR-011, mise à jour).
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const result = await enqueueScheduleCloseouts(admin);
  await drainJobsBestEffort(admin, DRAIN_BATCH_SIZE, "enqueue-schedule-closeouts");
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
