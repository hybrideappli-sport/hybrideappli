import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";

/**
 * `job_queue` — enrôlement + drain (ADR-011, `docs/db-schema.md` §8). Table strictement
 * `service_role` (aucune policy RLS) : ce module n'est jamais appelé avec un client authentifié.
 */
export type JobKind = "weekly_review" | "objective_check";

/**
 * Après combien de secondes d'immobilité un job `running` est considéré planté et repris
 * (ADR-011 §3 : « un job planté est repris après expiration du verrou »). 15 min : largement
 * au-dessus du budget `maxDuration = 60` d'une seule invocation de `drain-jobs`, pour ne jamais
 * reprendre un job encore légitimement en cours dans une invocation voisine.
 */
export const JOB_STUCK_AFTER_SECONDS = 900;

/** Abandon après N tentatives (ADR-011 §3) — alerte plutôt qu'un silence indéfini. */
export const MAX_JOB_ATTEMPTS = 5;

/**
 * `enqueueJob()` — idempotent par construction : `idempotency_key` est `UNIQUE` en base
 * (`job_queue_idempotency_key_key`). Une clé déjà présente n'insère rien (`ignoreDuplicates`),
 * jamais une erreur — l'appelant (`/cron/enqueue-weekly-reviews`, `/cron/enqueue-objective-checks`)
 * peut être rejoué sans précaution particulière.
 */
export async function enqueueJob(
  admin: SupabaseClient<Database>,
  args: { kind: JobKind; userId: string; idempotencyKey: string; payload?: Record<string, unknown>; scheduledFor: string },
): Promise<{ enqueued: boolean }> {
  const { kind, userId, idempotencyKey, payload, scheduledFor } = args;
  const { data, error } = await admin
    .from("job_queue")
    .upsert(
      {
        kind,
        user_id: userId,
        idempotency_key: idempotencyKey,
        payload: (payload ?? {}) as unknown as Json,
        scheduled_for: scheduledFor,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`enqueueJob: job_queue — ${error.message}`);
  return { enqueued: (data?.length ?? 0) > 0 };
}

export interface ClaimedJob {
  id: string;
  kind: string;
  userId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  scheduledFor: string;
}

/**
 * `claimJobs()` — verrouillage concurrent réel (`FOR UPDATE SKIP LOCKED`, ADR-011 §3), exprimé via
 * la fonction Postgres `claim_job_queue()` (`0011_job_queue_claim.sql`) : PostgREST/supabase-js
 * n'exposent aucun moyen d'écrire cette requête directement depuis le client applicatif. Requeue
 * d'abord les jobs `running` orphelins (verrou expiré), puis réserve un lot borné.
 */
export async function claimJobs(admin: SupabaseClient<Database>, limit: number): Promise<ClaimedJob[]> {
  const { error: requeueError } = await admin.rpc("requeue_stuck_job_queue", { p_stuck_after_seconds: JOB_STUCK_AFTER_SECONDS });
  if (requeueError) throw new Error(`claimJobs: requeue_stuck_job_queue — ${requeueError.message}`);

  const { data, error } = await admin.rpc("claim_job_queue", { p_limit: limit });
  if (error) throw new Error(`claimJobs: claim_job_queue — ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    userId: row.user_id,
    payload: (row.payload as Record<string, unknown>) ?? {},
    attempts: row.attempts,
    scheduledFor: row.scheduled_for,
  }));
}

/** Back-off exponentiel borné (2^attempts minutes, plafonné à 60 min) avant la prochaine tentative. */
function nextAttemptDelayMs(attempts: number): number {
  return Math.min(60, 2 ** attempts) * 60_000;
}

export async function markJobDone(admin: SupabaseClient<Database>, jobId: string): Promise<void> {
  const { error } = await admin.from("job_queue").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", jobId);
  if (error) throw new Error(`markJobDone: job_queue — ${error.message}`);
}

/**
 * Échec d'un job déjà réservé — abandon (alerte, jamais un silence) après `MAX_JOB_ATTEMPTS`,
 * sinon replanification avec back-off (`scheduled_for` repoussée, `status` repassé `pending`).
 */
export async function markJobFailed(
  admin: SupabaseClient<Database>,
  args: { jobId: string; attempts: number; error: string },
): Promise<{ abandoned: boolean }> {
  const { jobId, attempts, error: lastError } = args;
  const abandoned = attempts >= MAX_JOB_ATTEMPTS;

  const { error } = await admin
    .from("job_queue")
    .update(
      abandoned
        ? { status: "abandoned", last_error: lastError, finished_at: new Date().toISOString(), locked_at: null }
        : {
            status: "pending",
            last_error: lastError,
            locked_at: null,
            scheduled_for: new Date(Date.now() + nextAttemptDelayMs(attempts)).toISOString(),
          },
    )
    .eq("id", jobId);
  if (error) throw new Error(`markJobFailed: job_queue — ${error.message}`);

  if (abandoned) {
    // ADR-011 §3 : « un échec est visible et diagnosticable, pas silencieux » — pas d'infrastructure
    // d'alerte dédiée à ce lot (devops, hors périmètre `developer`) : log structuré en attendant.
    console.error(`[job_queue] job ${jobId} abandoned after ${attempts} attempts: ${lastError}`);
  }

  return { abandoned };
}
