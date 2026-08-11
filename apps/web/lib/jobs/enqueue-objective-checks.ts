import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";

import { enqueueJob } from "./queue";

/**
 * `POST /api/v1/cron/enqueue-objective-checks` (cron quotidien, AC14) : enrôle chaque objectif
 * `active` dont `target_date` est atteinte ou dépassée. `idempotencyKey` ne porte AUCUNE
 * composante temporelle variable (contrairement à `weekly_review`) : un objectif donné ne doit être
 * traité qu'UNE SEULE FOIS dans toute sa vie (`runObjectiveCheck()` fait ensuite basculer
 * `objectives.status = 'expired'`, ce qui arrête tout réenrôlement futur même si cette route est
 * rejouée). `now` en UTC serveur : contrairement à la révision hebdomadaire (rituel « dimanche soir
 * heure locale »), AC14 ne prescrit aucune précision par fuseau — une vérification quotidienne au
 * jour près suffit.
 */
export async function enqueueObjectiveChecks(admin: SupabaseClient<Database>, now: string): Promise<{ scanned: number; enqueued: number }> {
  const { data: objectives, error } = await admin
    .from("objectives")
    .select("id, user_id, target_date")
    .eq("status", "active")
    .not("target_date", "is", null)
    .lte("target_date", now);
  if (error) throw new Error(`enqueueObjectiveChecks: objectives — ${error.message}`);

  let enqueued = 0;
  for (const objective of objectives ?? []) {
    const result = await enqueueJob(admin, {
      kind: "objective_check",
      userId: objective.user_id,
      idempotencyKey: `objective_check:${objective.id}`,
      payload: { objectiveId: objective.id },
      scheduledFor: new Date().toISOString(),
    });
    if (result.enqueued) enqueued += 1;
  }

  return { scanned: objectives?.length ?? 0, enqueued };
}
