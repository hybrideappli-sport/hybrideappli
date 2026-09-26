import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { MAX_DEBRIEF_REFORMULATIONS } from "@hybride/coach-llm";
import type { DebriefDraft } from "@hybride/domain";

import { buildClosedQuestion, type ClosedQuestion } from "@/lib/debrief/closed-questions";

export interface DebriefMessageView {
  id: string;
  role: "coach" | "user";
  content: string;
  isReformulation: boolean;
}

export interface DebriefView {
  /** La séance À LAQUELLE le débrief est rattaché — pas forcément celle affichée, voir plus bas. */
  plannedSessionId: string;
  status: "in_progress" | "completed" | "abandoned";
  sessionLogId: string | null;
  messages: DebriefMessageView[];
  /** Reprise d'un échange arrivé en questions fermées : les chips réapparaissent. */
  closedQuestion: ClosedQuestion | null;
}

/**
 * `readDebriefForSession()` — l'état d'un débrief pour `/aujourdhui` (US-05, Lot L3). `null` si la
 * séance n'a pas encore de débrief. Lecture seule, AUCUN appel LLM : l'écran se construit sans
 * coût, et le premier appel au modèle n'a lieu qu'au premier message de l'utilisateur.
 *
 * Le débrief est cherché par la séance affichée, PUIS par le log du jour. Le second chemin n'est
 * pas un détail : un signal négatif écrit en cours de conversation régénère le plan, et la séance
 * du jour devient une NOUVELLE ligne `planned_sessions`. Chercher par la seule séance affichée
 * perdait alors la conversation au rechargement, au moment précis où le coach demande encore
 * `rpe` ou `freshness`.
 */
export async function readDebriefForSession(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; sessionLogId: string | null },
): Promise<DebriefView | null> {
  const columns = "id, planned_session_id, status, draft, session_log_id";
  const { data: bySession, error } = await admin
    .from("debrief_sessions")
    .select(columns)
    .eq("planned_session_id", args.plannedSessionId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) throw new Error(`readDebriefForSession: debrief_sessions — ${error.message}`);

  let debrief = bySession;
  if (!debrief && args.sessionLogId) {
    const { data: byLog, error: byLogError } = await admin
      .from("debrief_sessions")
      .select(columns)
      .eq("session_log_id", args.sessionLogId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (byLogError) throw new Error(`readDebriefForSession: debrief_sessions (par log) — ${byLogError.message}`);
    debrief = byLog;
  }
  if (!debrief) return null;

  const { data: rows, error: messagesError } = await admin
    .from("debrief_messages")
    .select("id, role, content, is_reformulation")
    .eq("session_id", debrief.id)
    .order("created_at", { ascending: true });
  if (messagesError) throw new Error(`readDebriefForSession: debrief_messages — ${messagesError.message}`);

  const messages = (rows ?? [])
    .filter((row) => row.role === "coach" || row.role === "user")
    .map((row) => ({ id: row.id, role: row.role as "coach" | "user", content: row.content, isReformulation: row.is_reformulation }));

  // Même compteur que l'orchestrateur : reformulations consécutives du coach en fin de fil.
  let reformulations = 0;
  for (const message of [...messages].reverse()) {
    if (message.role !== "coach") continue;
    if (!message.isReformulation) break;
    reformulations += 1;
  }

  return {
    plannedSessionId: debrief.planned_session_id,
    status: debrief.status,
    sessionLogId: debrief.session_log_id,
    messages,
    closedQuestion:
      debrief.status === "in_progress" && reformulations >= MAX_DEBRIEF_REFORMULATIONS
        ? buildClosedQuestion((debrief.draft ?? {}) as DebriefDraft)
        : null,
  };
}
