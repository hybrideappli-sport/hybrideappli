"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type HealthConsentFormProps = {
  title: string;
  bodyMd: string;
};

/**
 * Écran DISTINCT du disclaimer (AC3, ADR-010 §2) — consentement explicite au traitement des
 * données de santé (FC, sommeil, poids, douleur), recueilli avant toute saisie de ces données.
 */
export function HealthConsentForm({ title, bodyMd }: HealthConsentFormProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConsent() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "health_data_processing", granted: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible d'enregistrer ce consentement pour le moment.");
      }
      router.push("/onboarding/recap");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-title text-foreground">{title}</h1>
      <Card>
        <CardContent className="max-h-96 overflow-y-auto whitespace-pre-wrap pt-5 text-body text-foreground-muted">
          {bodyMd}
        </CardContent>
      </Card>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="peer size-6 shrink-0 appearance-none rounded-sm border-[1.5px] border-border-strong bg-transparent checked:border-accent checked:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            aria-label="Je consens au traitement de mes données de santé"
            aria-describedby={error ? "health-consent-error" : undefined}
          />
          <Check aria-hidden="true" className="pointer-events-none absolute size-4 text-on-accent opacity-0 peer-checked:opacity-100" />
        </span>
        <span className="text-body text-foreground">
          Je consens au traitement de mes données de santé (fréquence cardiaque, sommeil, poids, douleur) pour permettre au coach IA
          d&apos;ajuster mon plan.
        </span>
      </label>
      {error ? (
        <p id="health-consent-error" role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={handleConsent} disabled={!checked || pending} loading={pending}>
        {pending ? "Validation…" : "J'accepte, continuer"}
      </Button>
    </div>
  );
}
