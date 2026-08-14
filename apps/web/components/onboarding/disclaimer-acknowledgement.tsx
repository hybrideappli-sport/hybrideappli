"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type DisclaimerAcknowledgementProps = {
  sessionId: string;
  title: string;
  bodyMd: string;
  documentVersion: string;
};

/**
 * Écran BLOQUANT dédié (AC3) — l'acquittement est explicite (case à cocher) et distinct du
 * consentement RGPD données de santé (écran suivant, `/onboarding/consentement`).
 */
export function DisclaimerAcknowledgement({ sessionId, title, bodyMd, documentVersion }: DisclaimerAcknowledgementProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAcknowledge() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/onboarding/session/${sessionId}/disclaimer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentVersion }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible d'acquitter le disclaimer pour le moment.");
      }
      router.push("/onboarding/consentement");
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
            aria-label="J'ai lu et je comprends cet avertissement"
            aria-describedby={error ? "disclaimer-acknowledgement-error" : undefined}
          />
          <Check aria-hidden="true" className="pointer-events-none absolute size-4 text-on-accent opacity-0 peer-checked:opacity-100" />
        </span>
        <span className="text-body text-foreground">
          J&apos;ai lu et je comprends que le coach IA n&apos;est pas un dispositif médical ni un professionnel de santé.
        </span>
      </label>
      {error ? (
        <p id="disclaimer-acknowledgement-error" role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={handleAcknowledge} disabled={!checked || pending} loading={pending}>
        {pending ? "Validation…" : "J'ai compris, continuer"}
      </Button>
    </div>
  );
}
