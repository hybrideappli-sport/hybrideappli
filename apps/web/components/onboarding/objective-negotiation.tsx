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
      <h1 className="text-lg font-semibold">Ton objectif mérite d&apos;être ajusté</h1>
      <Card>
        <CardContent className="pt-6 text-sm text-neutral-700">
          <p>{reasoning.short}</p>
          <details className="mt-2 text-neutral-500">
            <summary className="cursor-pointer text-xs font-medium">En savoir plus</summary>
            <p className="mt-1 whitespace-pre-wrap text-xs">{reasoning.long}</p>
          </details>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {proposals.map((proposal) => (
          <Card key={proposal.id}>
            <CardHeader>
              <CardTitle className="text-sm">{proposal.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-neutral-700">
              <p className="text-neutral-500">Nouvelle date cible : {proposal.targetDate}</p>
              <p>{proposal.rationale}</p>
              <Button variant="secondary" onClick={() => onAcceptProposal(proposal.id)} disabled={pending}>
                Choisir cette proposition
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button variant="ghost" onClick={onKeepOriginal} disabled={pending}>
        Je confirme mon objectif initial, en connaissance de cause
      </Button>
    </div>
  );
}
