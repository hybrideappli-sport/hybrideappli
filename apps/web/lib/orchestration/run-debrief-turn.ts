import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { runDebriefTurn, type DebriefTurnResult } from "@hybride/coach-llm";
import type { DebriefDraft } from "@hybride/domain";

import { getLlmProvider } from "@/lib/coach-llm-provider";

/**
 * `runDebriefTurnForSession()` — un tour de débrief post-séance, persistance comprise
 * (US-05, Lot L1, ADR-019).
 *
 * Extrait du Route Handler pour la même raison que les autres orchestrateurs : la route dépend de
 * `requireUser()`/`next/headers`, hors de portée d'un test d'intégration Node.
 *
 * Portée du Lot L1, volontairement bornée : **aucune écriture dans `session_logs`**. Ce module
 * accumule un brouillon et rien d'autre. L'écriture précoce du réalisé — dès que `completion` et
 * `pain` sont obtenus — est le Lot L2.
 */

export class DebriefSessionNotFoundError extends Error {}

/** Borne de tours par débrief, même esprit que `MAX_TURNS_PER_SESSION` de l'onboarding : un coût
 *  LLM par séance ne doit pas pouvoir filer. Un débrief tient largement en dessous. */
const MAX_TURNS_PER_DEBRIEF = 20;

export interface DebriefTurnOutcome extends DebriefTurnResult {
  debriefSessionId: string;
  turnCount: number;
  reachedTurnLimit: boolean;
}

export async function runDebriefTurnForSession(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; userMessage: string },
): Promise<DebriefTurnOutcome> {
  const { userId, plannedSessionId, userMessage } = args;

  const { data: planned, error: plannedError } = await admin
    .from("planned_sessions")
    .select("id, session_type, duration_min, sports(code, label_fr)")
    .eq("id", plannedSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (plannedError) throw new Error(`runDebriefTurnForSession: planned_sessions — ${plannedError.message}`);
  if (!planned) throw new DebriefSessionNotFoundError(`Séance ${plannedSessionId} introuvable pour cet utilisateur.`);

  // Une conversation par séance (ADR-019 §2) — l'unicité est aussi portée par la contrainte
  // `debrief_sessions_planned_session_id_key`, qui reste l'autorité en cas de course.
  const { data: existing, error: existingError } = await admin
    .from("debrief_sessions")
    .select("id, draft, turn_count")
    .eq("planned_session_id", plannedSessionId)
    .maybeSingle();
  if (existingError) throw new Error(`runDebriefTurnForSession: debrief_sessions (lecture) — ${existingError.message}`);

  let debriefSessionId = existing?.id ?? null;
  let draft = (existing?.draft ?? {}) as DebriefDraft;
  let turnCount = existing?.turn_count ?? 0;

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
    };
  }

  const { data: historyRows, error: historyError } = await admin
    .from("debrief_messages")
    .select("role, content")
    .eq("session_id", debriefSessionId)
    .order("created_at", { ascending: true });
  if (historyError) throw new Error(`runDebriefTurnForSession: debrief_messages (lecture) — ${historyError.message}`);

  const history = (historyRows ?? [])
    .filter((row): row is { role: "coach" | "user"; content: string } => row.role === "coach" || row.role === "user")
    .map((row) => ({ role: row.role, content: row.content }));

  const { error: userMsgError } = await admin
    .from("debrief_messages")
    .insert({ session_id: debriefSessionId, user_id: userId, role: "user", content: userMessage });
  if (userMsgError) throw new Error(`runDebriefTurnForSession: debrief_messages (message utilisateur) — ${userMsgError.message}`);

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
    reformulationCount: 0,
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

  return { ...turn, draft, debriefSessionId, turnCount, reachedTurnLimit: false };
}
