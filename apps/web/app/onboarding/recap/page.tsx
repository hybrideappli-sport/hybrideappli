import type { Metadata } from "next";
import type { ProfileDraft } from "@hybride/domain";

import { getCurrentOnboardingSession } from "@/lib/onboarding/get-current-session";
import { buildConfirmedProfile } from "@/lib/onboarding/build-confirmed-profile";
import { OnboardingReview } from "@/components/onboarding/onboarding-review";
import { sportLabelsFor } from "@/lib/sport-labels";

export const metadata: Metadata = {
  title: "Onboarding — Récapitulatif",
};

export default async function OnboardingRecapPage() {
  const { session } = await getCurrentOnboardingSession();

  const result = buildConfirmedProfile((session.profile_draft ?? {}) as ProfileDraft);

  if (!result.success) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-title text-foreground">Ton profil n&apos;est pas encore complet</h1>
        <p className="text-body text-foreground-muted">{result.message}</p>
        <a href="/onboarding/chat" className="text-body-strong font-semibold text-accent underline-offset-4 hover:underline">
          Retourner au chat
        </a>
      </div>
    );
  }

  // Les libellés sont résolus ICI : `ProfileRecap` est un composant client et ne peut pas lire
  // `sports.label_fr` lui-même. Une seule lecture pour toutes les disciplines déclarées.
  const sportLabels = await sportLabelsFor(result.profile.sports.map((sport) => sport.sportCode));

  return <OnboardingReview sessionId={session.id} profile={result.profile} sportLabels={Object.fromEntries(sportLabels)} />;
}
