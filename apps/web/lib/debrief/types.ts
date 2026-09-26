import type { BodyZone, CreateSessionLogResponse } from "@hybride/domain";

import type { ClosedQuestion } from "./closed-questions";

/** Réponse de `POST /api/v1/debrief/:plannedSessionId/messages` (US-05, Lot L3). */
export interface DebriefTurnResponse {
  debriefSessionId: string;
  reply: string;
  isReformulation: boolean;
  canClose: boolean;
  reachedTurnLimit: boolean;
  closedQuestion: ClosedQuestion | null;
  sessionLogId: string | null;
  /** L'écriture de CE tour : ajustement éventuel et protocole douleur, à afficher tout de suite. */
  logWrite: { kind: "created" | "updated"; result: CreateSessionLogResponse } | null;
  painZone: BodyZone | null;
}
