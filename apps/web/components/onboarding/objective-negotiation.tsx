"use client";

import type { FeasibilityProposalView } from "@hybride/domain";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ObjectiveNegotiationProps = {
  reasoning: { short: string; long: string };
  proposals: FeasibilityProposalView[];
  onAcceptProposal: (proposalId: string) => void;
  onKeepOriginal: () => void;
  pending: boolean;
  error: string | null;
};

/**
 * AC2 — objectif jugé irréaliste par le moteur : jamais de plan silencieusement inatteignable.
 * Thomas peut accepter une proposition ou confirmer son objectif initial en connaissance de cause
 * (`canKeepOriginal`).
 */
export function ObjectiveNegotiation({ reasoning, proposals, onAcceptProposal, onKeepOriginal, pending, error }: ObjectiveNegotiationProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-title text-foreground">Ton objectif mérite d&apos;être ajusté</h1>
      <Card>
        <CardContent className="flex flex-col gap-2 pt-5 text-body text-foreground-muted">
          <p>{reasoning.short}</p>
          <details className="text-foreground-subtle">
            <summary className="cursor-pointer text-body-strong font-semibold text-accent">
              En savoir plus →
            </summary>
            <p className="mt-1 whitespace-pre-wrap text-small">{reasoning.long}</p>
          </details>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {proposals.map((proposal) => (
          <Card key={proposal.id}>
            <CardHeader>
              <CardTitle>{proposal.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-body text-foreground-muted">
              <p className="text-small">Nouvelle date cible : {proposal.targetDate}</p>
              <p>{proposal.rationale}</p>
              <Button variant="secondary" onClick={() => onAcceptProposal(proposal.id)} disabled={pending}>
                Choisir cette proposition
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <Button variant="ghost" onClick={onKeepOriginal} disabled={pending}>
        Je confirme mon objectif initial, en connaissance de cause
      </Button>
    </div>
  );
}
