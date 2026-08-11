/**
 * AC14 — fin d'objectif atteinte. Le moteur (`@hybride/rules-engine`, pipeline étape 4) ne laisse
 * jamais un plan vide quand `objective.targetDate` est dépassée (trigger `objective_end`) : il
 * construit un horizon de transition/récupération et trace le déclenchement de l'offre
 * (`objective_end.offer`). Ce module porte la vue assemblée côté serveur (deux propositions
 * explicites, jamais un vide) — `GET /objectives/:id/end-offer`.
 */

export interface ObjectiveEndProposalView {
  kind: "new_objective" | "transition_recovery";
  label: string;
  rationale: string;
}

export type ObjectiveEndResponse =
  | {
      status: "ended";
      objectiveId: string;
      targetDate: string;
      explanation: { short: string; long: string | null };
      proposals: ObjectiveEndProposalView[];
    }
  | { status: "active"; objectiveId: string };
