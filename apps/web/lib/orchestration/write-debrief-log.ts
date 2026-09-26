import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import {
  CreateSessionLogInputSchema,
  UpdateSessionLogInputSchema,
  type CreateSessionLogResponse,
  type DebriefDraft,
  type UpdateSessionLogInput,
} from "@hybride/domain";

import { applyDailyLog } from "./apply-daily-log";
import { applySessionLogCorrection } from "./apply-session-log-correction";

/**
 * `writeDebriefLog()` — écriture précoce du réalisé depuis un débrief (US-05, Lot L2, ADR-019 §3).
 *
 * ```
 * completion + pain (+ painZone)  obtenus  ⟹  applyDailyLog()             (POST /session-logs)
 * tout champ obtenu ensuite                ⟹  applySessionLogCorrection() (PATCH /session-logs/:id)
 * ```
 *
 * Le débrief n'a PAS de chemin d'écriture propre : il emprunte les deux orchestrateurs du
 * formulaire, et donc exactement le même pipeline (`runSessionLogSignalPipeline()`) — charge
 * réalisée, réconciliation, protocole douleur, baisse de 20 % sur signal négatif. Une conversation
 * et un formulaire qui disent la même chose produisent le même plan.
 *
 * Validation : le brouillon est repassé dans `CreateSessionLogInputSchema` /
 * `UpdateSessionLogInputSchema` avant toute écriture, comme un corps de requête. Le brouillon a déjà
 * été validé champ par champ (`DebriefDraftPatchSchema`), mais pas les invariants qui croisent les
 * champs (`pain ≠ none` ⟹ zone) — c'est le rôle du `superRefine`, puis de la contrainte SQL
 * `pain_zone_required`.
 */

export class DebriefLogValidationError extends Error {}

/** Champs du brouillon qui existent aussi dans `UpdateSessionLogInputSchema`. `sportCode` et
 *  `sessionType` n'y sont pas : la correction ne change jamais le rattachement d'une séance. */
const PATCHABLE_FIELDS = [
  "completion",
  "notDoneReason",
  "actualDurationMin",
  "rpe",
  "freshness",
  "pain",
  "painZone",
  "painAtRest",
  "comment",
] as const satisfies readonly (keyof UpdateSessionLogInput & keyof DebriefDraft)[];

export interface DebriefLogWrite {
  kind: "created" | "updated";
  logId: string;
  result: CreateSessionLogResponse;
}

/**
 * Le log auquel ce débrief écrit, s'il existe déjà.
 *
 * 1. `debrief_sessions.session_log_id` — le cas nominal d'une reprise ;
 * 2. à défaut, un log NON EXCLU déjà rattaché à la séance. Deux situations y mènent : l'utilisateur
 *    a rempli le formulaire avant d'ouvrir la conversation, ou un tour précédent a inséré le log
 *    puis échoué avant de le lier. Dans les deux cas, en créer un second ferait compter la séance
 *    deux fois dans la charge réalisée.
 */
async function findTargetLog(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; linkedLogId: string | null },
): Promise<string | null> {
  if (args.linkedLogId) return args.linkedLogId;

  const { data, error } = await admin
    .from("session_logs")
    .select("id")
    .eq("user_id", args.userId)
    .eq("planned_session_id", args.plannedSessionId)
    .is("excluded_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`writeDebriefLog: session_logs (recherche) — ${error.message}`);
  return data?.id ?? null;
}

/** Colonne de `session_logs` correspondant à chaque champ corrigeable. */
const COLUMN_OF = {
  completion: "completion",
  notDoneReason: "not_done_reason",
  actualDurationMin: "actual_duration_min",
  rpe: "rpe",
  freshness: "freshness",
  pain: "pain",
  painZone: "pain_zone",
  painAtRest: "pain_at_rest",
  comment: "comment",
} as const satisfies Record<(typeof PATCHABLE_FIELDS)[number], string>;

/**
 * Ce que le brouillon dit et que le log en base ne dit pas encore. On compare au LOG, pas au
 * brouillon du tour précédent : si une écriture antérieure a échoué, le champ perdu est rattrapé au
 * tour suivant au lieu de disparaître. Et un PATCH qui réécrirait des valeurs identiques relancerait
 * le pipeline pour rien.
 *
 * `pain` et `painZone` voyagent toujours ensemble : `UpdateSessionLogInputSchema` refuse un `pain`
 * autre que `none` sans sa zone, même si la zone est déjà en base.
 */
function deltaAgainstRow(draft: DebriefDraft, row: Record<string, unknown> | null): Partial<UpdateSessionLogInput> {
  const delta: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (draft[field] !== undefined && (row === null || draft[field] !== row[COLUMN_OF[field]])) delta[field] = draft[field];
  }
  if (row !== null && (delta["pain"] !== undefined || delta["painZone"] !== undefined)) {
    if (draft.pain !== undefined) delta["pain"] = draft.pain;
    if (draft.painZone !== undefined) delta["painZone"] = draft.painZone;
  }
  return delta as Partial<UpdateSessionLogInput>;
}

/**
 * Écrit (ou enrichit) le réalisé si le brouillon le permet. Renvoie `null` si rien n'est à écrire :
 * trio obligatoire incomplet, ou rien de nouveau depuis la dernière écriture.
 *
 * `rls` est le client de l'UTILISATEUR : l'insertion et la mise à jour passent par les policies
 * `session_logs_insert_own` / `session_logs_update_own`, qui revérifient le consentement santé en
 * profondeur (ADR-010 §2). Le débrief n'écrit jamais le réalisé en `service_role`.
 */
export async function writeDebriefLog(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    now: string;
    debriefSessionId: string;
    plannedSessionId: string;
    scheduledDate: string;
    linkedLogId: string | null;
    draft: DebriefDraft;
    missingMandatory: readonly string[];
  },
): Promise<DebriefLogWrite | null> {
  const { userId, now, draft } = args;
  if (args.missingMandatory.length > 0) return null;

  const targetLogId = await findTargetLog(admin, {
    userId,
    plannedSessionId: args.plannedSessionId,
    linkedLogId: args.linkedLogId,
  });

  let write: DebriefLogWrite | null;
  if (!targetLogId) {
    const parsed = CreateSessionLogInputSchema.safeParse({
      plannedSessionId: args.plannedSessionId,
      loggedDate: args.scheduledDate,
      ...deltaAgainstRow(draft, null),
    });
    if (!parsed.success) throw new DebriefLogValidationError(`writeDebriefLog: brouillon non conforme — ${parsed.error.message}`);
    const result = await applyDailyLog(rls, admin, { userId, now, input: parsed.data });
    write = { kind: "created", logId: result.logId, result };
  } else {
    const { data: row, error: rowError } = await admin
      .from("session_logs")
      .select("completion, not_done_reason, actual_duration_min, rpe, freshness, pain, pain_zone, pain_at_rest, comment")
      .eq("id", targetLogId)
      .single();
    if (rowError) throw new Error(`writeDebriefLog: session_logs (relecture) — ${rowError.message}`);
    const delta = deltaAgainstRow(draft, row);
    if (Object.keys(delta).length === 0) {
      write = null;
    } else {
      const parsed = UpdateSessionLogInputSchema.safeParse(delta);
      if (!parsed.success) throw new DebriefLogValidationError(`writeDebriefLog: enrichissement non conforme — ${parsed.error.message}`);
      const result = await applySessionLogCorrection(rls, admin, { userId, now, logId: targetLogId, input: parsed.data });
      write = { kind: "updated", logId: targetLogId, result };
    }
  }

  const logId = write?.logId ?? targetLogId;
  if (logId && logId !== args.linkedLogId) {
    const { error } = await admin.from("debrief_sessions").update({ session_log_id: logId }).eq("id", args.debriefSessionId);
    if (error) throw new Error(`writeDebriefLog: debrief_sessions (lien) — ${error.message}`);
  }

  return write;
}
