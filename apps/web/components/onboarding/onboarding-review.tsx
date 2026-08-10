"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { CompleteOnboardingResponse, ConfirmedProfile } from "@hybride/domain";

import { ProfileRecap } from "@/components/onboarding/profile-recap";
import { ObjectiveNegotiation } from "@/components/onboarding/objective-negotiation";

type OnboardingReviewProps = {
  sessionId: string;
  profile: ConfirmedProfile;
};

type NegotiationState = Extract<CompleteOnboardingResponse, { outcome: "objective_negotiation" }>;

export function OnboardingReview({ sessionId, profile }: OnboardingReviewProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [negotiation, setNegotiation] = useState<NegotiationState | null>(null);

  async function handleValidate() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/onboarding/session/${sessionId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedProfile: profile }),
      });
      const body = (await response.json().catch(() => null)) as CompleteOnboardingResponse | { error: { message: string } } | null;
      if (!response.ok) {
        throw new Error((body as { error?: { message: string } })?.error?.message ?? "Impossible de générer ton plan pour le moment.");
      }
      const result = body as CompleteOnboardingResponse;
      if (result.outcome === "objective_negotiation") {
        setNegotiation(result);
        setPending(false);
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  async function handleNegotiation(decision: { decision: "accept_proposal" | "keep_original"; proposalId?: string }) {
    if (!negotiation) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/objectives/${negotiation.objectiveId}/negotiation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible d'enregistrer ta décision pour le moment.");
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  if (negotiation) {
    return (
      <ObjectiveNegotiation
        reasoning={negotiation.reasoning}
        proposals={negotiation.proposals}
        onAcceptProposal={(proposalId) => handleNegotiation({ decision: "accept_proposal", proposalId })}
        onKeepOriginal={() => handleNegotiation({ decision: "keep_original" })}
        pending={pending}
        error={error}
      />
    );
  }

  return <ProfileRecap profile={profile} onValidate={handleValidate} pending={pending} error={error} />;
}
