import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { runDebriefTurn, type DebriefTurnResult } from "@hybride/coach-llm";
import type { DebriefDraft } from "@hybride/domain";

import { getLlmProvider } from "@/lib/coach-llm-provider";

import { writeDebriefLog, type DebriefLogWrite } from "./write-debrief-log";

/**
 * `runDebriefTurnForSession()` — un tour de débrief post-séance, persistance comprise
 * (US-05, Lot L1, ADR-019).
 *
 * Extrait du Route Handler pour la même raison que les autres orchestrateurs : la route dépend de
 * `requireUser()`/`next/headers`, hors de portée d'un test d'intégration Node.
 *
 * Écriture précoce (Lot L2, ADR-019 §3) : dès que le trio obligatoire est obtenu, le tour écrit le
 * réalisé via `writeDebriefLog()`, puis l'enrichit aux tours suivants. L'écriture vient APRÈS la
 * persistance de l'échange : si elle échoue, la conversation est intacte et le tour suivant la
 * retente — `writeDebriefLog()` retrouve alors un log inséré mais pas encore lié.
 */

export class DebriefSessionNotFoundError extends Error {}

/** Borne de tours par débrief, même esprit que `MAX_TURNS_PER_SESSION` de l'onboarding : un coût
 *  LLM par séance ne doit pas pouvoir filer. Un débrief tient largement en dessous. */
const MAX_TURNS_PER_DEBRIEF = 20;

export interface DebriefTurnOutcome extends DebriefTurnResult {
  debriefSessionId: string;
  turnCount: number;
  reachedTurnLimit: boolean;
  /** L'écriture de CE tour, `null` si rien n'a été écrit. Porte `painProtocol` : un renvoi vers un
   *  professionnel de santé (AC9) doit être affiché dans la conversation, pas seulement stocké. */
  logWrite: DebriefLogWrite | null;
  /** Le log de la séance, écrit à ce tour ou avant. `null` tant que le trio n'est pas obtenu. */
  sessionLogId: string | null;
}

/**
 * `rls` : client de l'utilisateur, par lequel passe l'écriture du réalisé (consentement santé
 * revérifié par RLS). `admin` : tout le reste — lecture de la séance, tables du débrief.
 * `now` : date locale de l'utilisateur, pour le pipeline de signaux (`todayInTimezone()`).
 */
export async function runDebriefTurnForSession(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; userMessage: string; now: string },
): Promise<DebriefTurnOutcome> {
  const { userId, plannedSessionId, userMessage, now } = args;

  const { data: planned, error: plannedError } = await admin
    .from("planned_sessions")
    .select("id, session_type, duration_min, scheduled_date, sports(code, label_fr)")
    .eq("id", plannedSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (plannedError) throw new Error(`runDebriefTurnForSession: planned_sessions — ${plannedError.message}`);
  if (!planned) throw new DebriefSessionNotFoundError(`Séance ${plannedSessionId} introuvable pour cet utilisateur.`);

  // Une conversation par séance (ADR-019 §2) — l'unicité est aussi portée par la contrainte
  // `debrief_sessions_planned_session_id_key`, qui reste l'autorité en cas de course.
  const { data: existing, error: existingError } = await admin
    .from("debrief_sessions")
    .select("id, draft, turn_count, session_log_id")
    .eq("planned_session_id", plannedSessionId)
    .maybeSingle();
  if (existingError) throw new Error(`runDebriefTurnForSession: debrief_sessions (lecture) — ${existingError.message}`);

  let debriefSessionId = existing?.id ?? null;
  let draft = (existing?.draft ?? {}) as DebriefDraft;
  let turnCount = existing?.turn_count ?? 0;
  const linkedLogId = existing?.session_log_id ?? null;

  if (!debriefSessionId) {
    const { data: created, error: createError } = await admin
      .from("debrief_sessions")
      .insert({ user_id: userId, planned_session_id: plannedSessionId })
      .select("id")
      .single();
    if (createError) throw new Error(`runDebriefTurnForSession: debrief_sessions (création) — ${createError.message}`);
    debriefSessionId = created.id;
  }

  if (turnCount >= MAX_TURNS_PER_DEBRIEF) {
    return {
      debriefSessionId,
      turnCount,
      reachedTurnLimit: true,
      reply: "On s'arrête là pour aujourd'hui.",
      isReformulation: false,
      extractionPatch: null,
      draft,
      missingMandatory: [],
      missingDesired: [],
      reformulationCount: 0,
      reachedReformulationLimit: false,
      canClose: false,
      logWrite: null,
      sessionLogId: linkedLogId,
    };
  }

  const { data: historyRows, error: historyError } = await admin
    .from("debrief_messages")
    .select("role, content, is_reformulation")
    .eq("session_id", debriefSessionId)
    .order("created_at", { ascending: true });
  if (historyError) throw new Error(`runDebriefTurnForSession: debrief_messages (lecture) — ${historyError.message}`);

  const history = (historyRows ?? [])
    .filter((row): row is typeof row & { role: "coach" | "user" } => row.role === "coach" || row.role === "user")
    .map((row) => ({ role: row.role, content: row.content }));

  // Reformulations CONSÉCUTIVES du coach en fin de fil : c'est ce compteur qui déclenche la bascule
  // en question fermée (`MAX_DEBRIEF_REFORMULATIONS`). Le recalculer depuis le journal évite une
  // colonne de plus, et une réponse comprise le remet naturellement à zéro.
  let reformulationCount = 0;
  for (const row of [...(historyRows ?? [])].reverse()) {
    if (row.role !== "coach") continue;
    if (!row.is_reformulation) break;
    reformulationCount += 1;
  }

  const { error: userMsgError } = await admin
    .from("debrief_messages")
    .insert({ session_id: debriefSessionId, user_id: userId, role: "user", content: userMessage });
  if (userMsgError) throw new Error(`runDebriefTurnForSession: debrief_messages (message utilisateur) — ${userMsgError.message}`);

  // Référentiel des disciplines, énuméré au modèle (ADR-019 §5). Client ADMIN, pas le client RLS :
  // cet orchestrateur sera appelé depuis un job au Lot L4, hors de toute requête. En cas d'échec
  // de lecture, le tour continue sans référentiel — aucun `sportCode` ne sera alors accepté, ce
  // qui est sûr : la discipline d'une séance planifiée est déjà connue du plan.
  const { data: sportRows, error: sportsError } = await admin.from("sports").select("code, label_fr").order("code");
  if (sportsError) console.error("[debrief] référentiel sports illisible, tour dégradé :", sportsError.message);

  const provider = getLlmProvider();
  const startedAt = Date.now();
  const turn = await runDebriefTurn(provider, {
    history,
    draft,
    userMessage,
    session: {
      sessionType: planned.session_type,
      durationMin: planned.duration_min,
      // Le libellé vient de la JOINTURE, pas du résolveur `sportLabel()` : celui-ci s'appuie sur
      // le client RLS lié aux cookies et n'est donc utilisable qu'en contexte de requête. Cet
      // orchestrateur sera appelé depuis un job au Lot L4, où il n'y en a aucun.
      sportLabel: (planned.sports as unknown as { label_fr: string } | null)?.label_fr ?? null,
      // Un débrief déclenché depuis une séance PLANIFIÉE n'est jamais hors plan : `sportCode` et
      // `actualDurationMin` sont déjà connus du plan (ADR-015 §1).
      isOffPlan: false,
    },
    reformulationCount,
    sportReferential: (sportRows ?? []).map((row) => ({ code: row.code, labelFr: row.label_fr })),
  });
  draft = turn.draft;
  turnCount += 1;

  const { error: coachMsgError } = await admin.from("debrief_messages").insert({
    session_id: debriefSessionId,
    user_id: userId,
    role: "coach",
    content: turn.reply,
    // Uniquement le patch VALIDÉ : une extraction rejetée n'est jamais persistée, pas même à titre
    // de trace. Elle est, par construction, hors contrat.
    extraction: turn.extractionPatch as never,
    is_reformulation: turn.isReformulation,
    latency_ms: Date.now() - startedAt,
  });
  if (coachMsgError) throw new Error(`runDebriefTurnForSession: debrief_messages (réponse coach) — ${coachMsgError.message}`);

  const { error: updateError } = await admin
    .from("debrief_sessions")
    .update({
      draft: draft as never,
      turn_count: turnCount,
      llm_model: provider.name,
      // `completed` marque la fin de l'ÉCHANGE, pas l'écriture d'un log — celle-ci arrive au L2.
      ...(turn.canClose ? { status: "completed" as const, completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", debriefSessionId);
  if (updateError) throw new Error(`runDebriefTurnForSession: debrief_sessions (mise à jour) — ${updateError.message}`);

  const logWrite = await writeDebriefLog(rls, admin, {
    userId,
    now,
    debriefSessionId,
    plannedSessionId,
    scheduledDate: planned.scheduled_date,
    linkedLogId,
    draft,
    missingMandatory: turn.missingMandatory,
  });

  return {
    ...turn,
    draft,
    debriefSessionId,
    turnCount,
    reachedTurnLimit: false,
    logWrite,
    sessionLogId: logWrite?.logId ?? linkedLogId,
  };
}
