import type { Metadata } from "next";

import { ImportConsentForm } from "@/components/data/import-consent-form";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Consentement — Import de données" };
export const dynamic = "force-dynamic";

/**
 * `/donnees/consentement` — ADR-013 §5. Écran BLOQUANT avant le flux OAuth, patron de l'écran de
 * consentement santé F1 (`onboarding/consentement/page.tsx`). Le texte affiché est TOUJOURS lu en
 * base (`consent_documents`) — `503` (jamais une erreur brute) si aucune version n'est en vigueur
 * dans cet environnement (ADR-010 §9 : contenu provisoire, non activé en production tant que non
 * validé juridiquement).
 */
export default async function ImportConsentPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const { provider } = await searchParams;
  const supabase = await getSupabaseServerClient();

  const { data: document } = await supabase
    .from("consent_documents")
    .select("title, body_md")
    .eq("code", "third_party_data_import")
    .eq("locale", "fr")
    .eq("is_current", true)
    .maybeSingle();

  if (!document) {
    return (
      <div className="flex flex-col gap-3 px-5 py-8">
        <h1 className="font-serif text-title text-foreground">Consentement indisponible</h1>
        <p className="text-body text-foreground-muted">
          Ce document n&apos;est pas encore disponible dans cet environnement. Réessaie plus tard ou contacte le support.
        </p>
      </div>
    );
  }

  return <ImportConsentForm title={document.title} bodyMd={document.body_md} provider={provider ?? "strava"} />;
}
