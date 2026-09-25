/**
 * `runDebriefTurn()` — orchestration d'un tour de débrief post-séance (US-05, Lot L1, ADR-019).
 *
 * Pendant exact de `runOnboardingTurn()`, et pour la même raison : le brouillon proposé par le
 * fournisseur est TOUJOURS validé avant d'être retourné. Une extraction non conforme n'est jamais
 * fusionnée — elle est écartée, et le tour requalifié en reformulation.
 *
 * Ne persiste rien : c'est l'appelant (route `/debrief/:plannedSessionId/messages`) qui écrit dans
 * `debrief_sessions.draft` et `debrief_messages`.
 *
 * Ne produit AUCUN `session_log` : l'écriture du réalisé arrive au Lot L2. Ce module s'arrête au
 * brouillon.
 */

import {
  DebriefDraftPatchSchema,
  mergeDebriefDraft,
  missingDesired,
  missingMandatory,
  missingOffPlan,
  type DebriefDraft,
  type DebriefDraftPatch,
} from "@hybride/domain";

import type { ConversationHistoryEntry, DebriefTurnInput, LlmProvider } from "./llm-provider";

/** Même borne que l'onboarding (`04-flow.md`) : après 2 incompréhensions sur la même question, on
 *  bascule en question fermée plutôt que de reformuler indéfiniment. */
export const MAX_DEBRIEF_REFORMULATIONS = 2;

export interface DebriefTurnRequest {
  history: ConversationHistoryEntry[];
  draft: DebriefDraft;
  userMessage: string;
  session: DebriefTurnInput["session"];
  reformulationCount: number;
}

export interface DebriefTurnResult {
  reply: string;
  isReformulation: boolean;
  /** `null` si rien n'a pu être extrait, ou si l'extraction proposée était invalide. */
  extractionPatch: DebriefDraftPatch | null;
  /** Brouillon APRÈS fusion — c'est lui que l'appelant persiste. */
  draft: DebriefDraft;
  /** Vide ⟹ le Lot L2 pourra écrire le `session_log`. */
  missingMandatory: string[];
  missingDesired: string[];
  reformulationCount: number;
  reachedReformulationLimit: boolean;
  /** Le fournisseur estime la conversation terminée ET plus rien d'obligatoire ne manque. */
  canClose: boolean;
}

export async function runDebriefTurn(provider: LlmProvider, request: DebriefTurnRequest): Promise<DebriefTurnResult> {
  const mandatoryBefore = missingMandatory(request.draft);
  const desiredBefore = missingDesired(request.draft);

  const output = await provider.converseDebrief({
    history: request.history,
    draft: request.draft as Record<string, unknown>,
    userMessage: request.userMessage,
    session: request.session,
    missingMandatory: mandatoryBefore,
    missingDesired: desiredBefore,
  });

  let extractionPatch: DebriefDraftPatch | null = null;
  let extractionRejected = false;
  if (output.extraction) {
    const parsed = DebriefDraftPatchSchema.safeParse(output.extraction);
    if (parsed.success) {
      extractionPatch = parsed.data;
    } else {
      // Sortie non conforme au contrat : rien n'entre dans le brouillon. Le tour devient une
      // reformulation même si le fournisseur ne l'avait pas signalé — un `genou_droit` là où le
      // contrat attend `knee` ne doit jamais atteindre la base (incident `course_a_pied`,
      // 2026-09-18).
      extractionRejected = true;
    }
  }

  const draft = extractionPatch ? mergeDebriefDraft(request.draft, extractionPatch) : request.draft;
  const mandatoryAfter = missingMandatory(draft);

  const isReformulation = output.isReformulation || (extractionRejected && extractionPatch === null);
  const reformulationCount = isReformulation ? request.reformulationCount + 1 : 0;

  // Hors plan : la discipline et la durée réelle conditionnent le calcul de charge (ADR-015 §1).
  // Elles ne bloquent pas la clôture — le Lot L2 décidera s'il peut écrire — mais une conversation
  // hors plan qui les ignore produira un log sans charge exploitable.
  const offPlanMissing = request.session.isOffPlan ? missingOffPlan(draft) : [];

  return {
    reply: output.reply,
    isReformulation,
    extractionPatch,
    draft,
    missingMandatory: [...mandatoryAfter, ...offPlanMissing],
    missingDesired: missingDesired(draft),
    reformulationCount,
    reachedReformulationLimit: reformulationCount >= MAX_DEBRIEF_REFORMULATIONS,
    canClose: output.suggestNextStep && mandatoryAfter.length === 0,
  };
}
