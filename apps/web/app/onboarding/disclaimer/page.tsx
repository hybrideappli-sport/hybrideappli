import type { Metadata } from "next";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentOnboardingSession } from "@/lib/onboarding/get-current-session";
import { DisclaimerAcknowledgement } from "@/components/onboarding/disclaimer-acknowledgement";

export const metadata: Metadata = {
  title: "Onboarding — Avertissement",
};

export default async function OnboardingDisclaimerPage() {
  const { session } = await getCurrentOnboardingSession();
  const supabase = await getSupabaseServerClient();

  const { data: document } = await supabase
    .from("consent_documents")
    .select("title, body_md, version")
    .eq("code", "medical_disclaimer")
    .eq("locale", "fr")
    .eq("is_current", true)
    .maybeSingle();

  if (!document) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Avertissement indisponible</h1>
        <p className="text-sm text-neutral-600">
          Le disclaimer n&apos;est pas encore disponible dans cet environnement. Réessaie plus tard ou contacte le support.
        </p>
      </div>
    );
  }

  return (
    <DisclaimerAcknowledgement sessionId={session.id} title={document.title} bodyMd={document.body_md} documentVersion={document.version} />
  );
}
