import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { runDebriefTurn, type DebriefTurnResult } from "@hybride/coach-llm";
import { mergeDebriefDraft, missingDesired, missingMandatory, type DebriefDraft } from "@hybride/domain";

import { getLlmProvider } from "@/lib/coach-llm-provider";
import {
  buildClosedQuestion,
  debriefOpening,
  describeChoice,
  DEBRIEF_CLOSING_REPLY,
  SESSION_TYPE_LABELS_FR,
  type ClosedQuestion,
  type DebriefChoice,
} from "@/lib/debrief/closed-questions";

import { writeDebriefLog, type DebriefLogWrite } from "./write-debrief-log";

/**
 * Orchestration d'un débrief post-séance, persistance comprise (US-05, ADR-019).
 *
 * Deux entrées, un seul socle :
 * - `runDebriefTurnForSession()` — un message en langage naturel, compris par le LLM ;
 * - `applyDebriefChoiceForSession()` — une réponse par chips (Lot L3), SANS appel LLM : elle arrive
 *   justement quand le modèle a échoué deux fois à comprendre.
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

/** Le fournisseur LLM n'a pas pu produire de tour (réseau, quota, clé absente, réponse illisible).
 *  L'écran bascule alors sur le formulaire (ADR-019 §Conséquences, repli sur échec LLM). */
export class DebriefLlmUnavailableError extends Error {}

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
  /** Question fermée à proposer en chips, `null` si l'échange reste libre (ADR-019 §6). */
  closedQuestion: ClosedQuestion | null;
}

interface DebriefContext {
  planned: {
    session_type: string;
    duration_min: number | null;
    scheduled_date: string;
    sports: unknown;
  };
  debriefSessionId: string;
  draft: DebriefDraft;
  turnCount: number;
  linkedLogId: string | null;
}

/** Charge la séance, retrouve ou crée SON débrief (un par séance, ADR-019 §2). À la création, le
 *  message d'ouverture est persisté : le modèle reçoit ainsi la question à laquelle on lui répond. */
async function loadContext(admin: SupabaseClient<Database>, userId: string, plannedSessionId: string): Promise<DebriefContext> {
  const { data: planned, error: plannedError } = await admin
    .from("planned_sessions")
    .select("id, session_type, duration_min, scheduled_date, sports(code, label_fr)")
    .eq("id", plannedSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (plannedError) throw new Error(`debrief: planned_sessions — ${plannedError.message}`);
  if (!planned) throw new DebriefSessionNotFoundError(`Séance ${plannedSessionId} introuvable pour cet utilisateur.`);

  // L'unicité est aussi portée par la contrainte `debrief_sessions_planned_session_id_key`, qui
  // reste l'autorité en cas de course.
  const { data: existing, error: existingError } = await admin
    .from("debrief_sessions")
    .select("id, draft, turn_count, session_log_id")
    .eq("planned_session_id", plannedSessionId)
    .maybeSingle();
  if (existingError) throw new Error(`debrief: debrief_sessions (lecture) — ${existingError.message}`);

  if (existing) {
    return {
      planned,
      debriefSessionId: existing.id,
      draft: (existing.draft ?? {}) as DebriefDraft,
      turnCount: existing.turn_count,
      linkedLogId: existing.session_log_id,
    };
  }

  const { data: created, error: createError } = await admin
    .from("debrief_sessions")
    .insert({ user_id: userId, planned_session_id: plannedSessionId })
    .select("id")
    .single();
  if (createError) throw new Error(`debrief: debrief_sessions (création) — ${createError.message}`);

  const { error: openingError } = await admin.from("debrief_messages").insert({
    session_id: created.id,
    user_id: userId,
    role: "coach",
    content: debriefOpening(SESSION_TYPE_LABELS_FR[planned.session_type] ?? null),
  });
  if (openingError) throw new Error(`debrief: debrief_messages (ouverture) — ${openingError.message}`);

  return { planned, debriefSessionId: created.id, draft: {}, turnCount: 0, linkedLogId: null };
}

function turnLimitOutcome(context: DebriefContext): DebriefTurnOutcome {
  return {
    debriefSessionId: context.debriefSessionId,
    turnCount: context.turnCount,
    reachedTurnLimit: true,
    reply: "On s'arrête là pour aujourd'hui.",
    isReformulation: false,
    extractionPatch: null,
    draft: context.draft,
    missingMandatory: [],
    missingDesired: [],
    reformulationCount: 0,
    reachedReformulationLimit: false,
    canClose: false,
    logWrite: null,
    sessionLogId: context.linkedLogId,
    closedQuestion: null,
  };
}

async function insertMessage(
  admin: SupabaseClient<Database>,
  row: Database["public"]["Tables"]["debrief_messages"]["Insert"],
): Promise<void> {
  const { error } = await admin.from("debrief_messages").insert(row);
  if (error) throw new Error(`debrief: debrief_messages (${row.role}) — ${error.message}`);
}

/** Fin commune des deux entrées : brouillon et compteur persistés, PUIS écriture du réalisé. */
async function persistAndWrite(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: {
    userId: string;
    now: string;
    plannedSessionId: string;
    context: DebriefContext;
    draft: DebriefDraft;
    turnCount: number;
    llmModel: string | null;
    close: boolean;
  },
): Promise<{ logWrite: DebriefLogWrite | null; sessionLogId: string | null }> {
  const { context } = args;
  const { error: updateError } = await admin
    .from("debrief_sessions")
    .update({
      draft: args.draft as never,
      turn_count: args.turnCount,
      ...(args.llmModel ? { llm_model: args.llmModel } : {}),
      // `completed` marque la fin de l'ÉCHANGE, pas l'écriture d'un log.
      ...(args.close ? { status: "completed" as const, completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", context.debriefSessionId);
  if (updateError) throw new Error(`debrief: debrief_sessions (mise à jour) — ${updateError.message}`);

  const logWrite = await writeDebriefLog(rls, admin, {
    userId: args.userId,
    now: args.now,
    debriefSessionId: context.debriefSessionId,
    plannedSessionId: args.plannedSessionId,
    scheduledDate: context.planned.scheduled_date,
    linkedLogId: context.linkedLogId,
    draft: args.draft,
    missingMandatory: missingMandatory(args.draft),
  });
  return { logWrite, sessionLogId: logWrite?.logId ?? context.linkedLogId };
}

/**
 * Un tour en langage naturel.
 *
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
  const context = await loadContext(admin, userId, plannedSessionId);
  if (context.turnCount >= MAX_TURNS_PER_DEBRIEF) return turnLimitOutcome(context);

  const { data: historyRows, error: historyError } = await admin
    .from("debrief_messages")
    .select("role, content, is_reformulation")
    .eq("session_id", context.debriefSessionId)
    .order("created_at", { ascending: true });
  if (historyError) throw new Error(`debrief: debrief_messages (lecture) — ${historyError.message}`);

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

  await insertMessage(admin, { session_id: context.debriefSessionId, user_id: userId, role: "user", content: userMessage });

  // Référentiel des disciplines, énuméré au modèle (ADR-019 §5). Client ADMIN, pas le client RLS :
  // cet orchestrateur sera appelé depuis un job au Lot L4, hors de toute requête. En cas d'échec
  // de lecture, le tour continue sans référentiel — aucun `sportCode` ne sera alors accepté, ce
  // qui est sûr : la discipline d'une séance planifiée est déjà connue du plan.
  const { data: sportRows, error: sportsError } = await admin.from("sports").select("code, label_fr").order("code");
  if (sportsError) console.error("[debrief] référentiel sports illisible, tour dégradé :", sportsError.message);

  // Tout échec du fournisseur, y compris une clé absente en production (`getLlmProvider()` refuse
  // alors de démarrer), devient `DebriefLlmUnavailableError` : l'écran sait s'y replier. Le message
  // de l'utilisateur est déjà persisté et le reste — un échange n'est jamais réécrit.
  const startedAt = Date.now();
  let providerName: string;
  let turn: DebriefTurnResult;
  try {
    const provider = getLlmProvider();
    providerName = provider.name;
    turn = await runDebriefTurn(provider, {
      history,
      draft: context.draft,
      userMessage,
      session: {
        sessionType: context.planned.session_type,
        durationMin: context.planned.duration_min,
        // Le libellé vient de la JOINTURE, pas du résolveur `sportLabel()` : celui-ci s'appuie sur
        // le client RLS lié aux cookies et n'est donc utilisable qu'en contexte de requête. Cet
        // orchestrateur sera appelé depuis un job au Lot L4, où il n'y en a aucun.
        sportLabel: (context.planned.sports as { label_fr: string } | null)?.label_fr ?? null,
        // Un débrief déclenché depuis une séance PLANIFIÉE n'est jamais hors plan : `sportCode` et
        // `actualDurationMin` sont déjà connus du plan (ADR-015 §1).
        isOffPlan: false,
      },
      reformulationCount,
      sportReferential: (sportRows ?? []).map((row) => ({ code: row.code, labelFr: row.label_fr })),
    });
  } catch (error) {
    console.error("[debrief] fournisseur LLM en échec, repli sur le formulaire :", error);
    throw new DebriefLlmUnavailableError(error instanceof Error ? error.message : String(error));
  }

  await insertMessage(admin, {
    session_id: context.debriefSessionId,
    user_id: userId,
    role: "coach",
    content: turn.reply,
    // Uniquement le patch VALIDÉ : une extraction rejetée n'est jamais persistée, pas même à titre
    // de trace. Elle est, par construction, hors contrat.
    extraction: turn.extractionPatch as never,
    is_reformulation: turn.isReformulation,
    latency_ms: Date.now() - startedAt,
  });

  const turnCount = context.turnCount + 1;
  const { logWrite, sessionLogId } = await persistAndWrite(rls, admin, {
    userId,
    now,
    plannedSessionId,
    context,
    draft: turn.draft,
    turnCount,
    llmModel: providerName,
    close: turn.canClose,
  });

  return {
    ...turn,
    debriefSessionId: context.debriefSessionId,
    turnCount,
    reachedTurnLimit: false,
    logWrite,
    sessionLogId,
    closedQuestion: turn.reachedReformulationLimit ? buildClosedQuestion(turn.draft) : null,
  };
}

/**
 * Une réponse par chips (Lot L3, ADR-019 §6). Aucun appel LLM : le choix, déjà validé par
 * `DebriefChoiceSchema`, entre tel quel dans le brouillon, et la réponse du coach est la question
 * fermée suivante. Une fois `rpe` / `freshness` répondus ou passés, l'échange est clos.
 */
export async function applyDebriefChoiceForSession(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; choice: DebriefChoice; now: string },
): Promise<DebriefTurnOutcome> {
  const { userId, plannedSessionId, choice, now } = args;
  const context = await loadContext(admin, userId, plannedSessionId);
  if (context.turnCount >= MAX_TURNS_PER_DEBRIEF) return turnLimitOutcome(context);

  const patch = "skip" in choice ? {} : choice;
  const draft = mergeDebriefDraft(context.draft, patch);
  const answeredDesired = "skip" in choice || choice.rpe !== undefined || choice.freshness !== undefined;
  const mandatoryLeft = missingMandatory(draft);

  // Après la question sur `rpe` / `freshness` — répondue ou passée — on ne relance plus : c'était
  // l'unique insistance. Sinon, la question fermée suivante.
  const closedQuestion = answeredDesired && mandatoryLeft.length === 0 ? null : buildClosedQuestion(draft);
  const close = closedQuestion === null;
  const reply = closedQuestion?.prompt ?? DEBRIEF_CLOSING_REPLY;

  await insertMessage(admin, { session_id: context.debriefSessionId, user_id: userId, role: "user", content: describeChoice(choice) });
  await insertMessage(admin, {
    session_id: context.debriefSessionId,
    user_id: userId,
    role: "coach",
    content: reply,
    extraction: ("skip" in choice ? null : patch) as never,
  });

  const turnCount = context.turnCount + 1;
  const { logWrite, sessionLogId } = await persistAndWrite(rls, admin, {
    userId,
    now,
    plannedSessionId,
    context,
    draft,
    turnCount,
    llmModel: null,
    close,
  });

  return {
    reply,
    isReformulation: false,
    extractionPatch: "skip" in choice ? null : patch,
    draft,
    missingMandatory: mandatoryLeft,
    missingDesired: missingDesired(draft),
    reformulationCount: 0,
    reachedReformulationLimit: false,
    canClose: close,
    debriefSessionId: context.debriefSessionId,
    turnCount,
    reachedTurnLimit: false,
    logWrite,
    sessionLogId,
    closedQuestion,
  };
}
