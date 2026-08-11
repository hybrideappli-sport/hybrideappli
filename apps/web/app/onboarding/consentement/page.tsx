import type { Metadata } from "next";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentOnboardingSession } from "@/lib/onboarding/get-current-session";
import { HealthConsentForm } from "@/components/onboarding/health-consent-form";

export const metadata: Metadata = {
  title: "Onboarding — Consentement données de santé",
};

export default async function OnboardingHealthConsentPage() {
  await getCurrentOnboardingSession();
  const supabase = await getSupabaseServerClient();

  const { data: document } = await supabase
    .from("consent_documents")
    .select("title, body_md")
    .eq("code", "health_data_processing")
    .eq("locale", "fr")
    .eq("is_current", true)
    .maybeSingle();

  if (!document) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Consentement indisponible</h1>
        <p className="text-sm text-neutral-600">
          Ce document n&apos;est pas encore disponible dans cet environnement. Réessaie plus tard ou contacte le support.
        </p>
      </div>
    );
  }

  return <HealthConsentForm title={document.title} bodyMd={document.body_md} />;
}
