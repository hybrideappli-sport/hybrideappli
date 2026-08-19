import { createSupabaseServiceRoleClient } from "@hybride/db/server";

import { apiError, apiJson } from "@/lib/api/respond";
import { isAuthorizedCronRequest } from "@/lib/api/require-cron-secret";
import { purgeStaleStripeEvents } from "@/lib/jobs/purge-stripe-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `/api/v1/cron/purge-stripe-events` — Vercel Cron QUOTIDIEN (`apps/web/vercel.json`, finding I3).
 * `stripe_events` n'a pas de `user_id` et n'est pas couverte par `erase_account()`
 * (`08-architecture.md` §5.3, question ouverte n°9) : ce job purge les événements de plus de 60
 * jours (`purge_stale_stripe_events()`, `supabase/migrations/0013_billing_robustness.sql`). `GET` +
 * `POST`, même garde `CRON_SECRET` que les autres routes cron (`require-cron-secret.ts`). N'enrôle
 * aucun `job_queue` : pas de drain synchrone à déclencher ici (ADR-011, mise à jour).
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) return apiError(401, "UNAUTHORIZED", "Requête cron non autorisée.");

  const admin = createSupabaseServiceRoleClient();
  const result = await purgeStaleStripeEvents(admin);
  return apiJson(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
