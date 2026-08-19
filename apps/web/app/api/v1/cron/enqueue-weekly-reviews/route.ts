import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { DRAIN_BATCH_SIZE, drainJobsBestEffort } from "@/lib/jobs/drain";
import { enqueueWeeklyReviews } from "@/lib/jobs/enqueue-weekly-reviews";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Aligné sur `drain-jobs/route.ts` (ADR-011 §7) : le drain synchrone qui suit l'enrôlement peut
 * exécuter jusqu'à `DRAIN_BATCH_SIZE` révisions hebdomadaires complètes dans la même invocation. */
export const maxDuration = 60;

/**
 * `/api/v1/cron/enqueue-weekly-reviews` — Vercel Cron QUOTIDIEN (`apps/web/vercel.json`, ADR-011
 * §1). Route interne décrite `POST` par `08-architecture.md` §6.8 : conservé pour un rejeu
 * manuel/un test. Exposée aussi en `GET`, seule méthode que Vercel Cron invoque réellement. Les
 * deux méthodes partagent la même garde `CRON_SECRET` — jamais un accès anonyme, quelle que soit la
 * méthode.
 *
 * Drain synchrone (ADR-011, mise à jour) : l'enrôlement est immédiatement suivi d'un
 * `drainJobsBestEffort()` pour traiter sans délai ce qui vient d'être mis en file, sans attendre le
 * prochain passage quotidien de `/cron/drain-jobs` (désormais un simple filet de sécurité). Best-
 * effort : une exception du drain ne fait jamais échouer la réponse de cette route.
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const result = await enqueueWeeklyReviews(admin);
  await drainJobsBestEffort(admin, DRAIN_BATCH_SIZE, "enqueue-weekly-reviews");
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
