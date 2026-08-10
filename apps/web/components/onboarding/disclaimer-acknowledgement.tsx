"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <h1 className="text-lg font-semibold">{title}</h1>
      <Card>
        <CardContent className="prose prose-sm max-h-96 overflow-y-auto whitespace-pre-wrap pt-6 text-sm text-neutral-700">{bodyMd}</CardContent>
      </Card>
      <label className="flex items-start gap-2 text-sm text-neutral-800">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-1"
          aria-label="J'ai lu et je comprends cet avertissement"
        />
        J&apos;ai lu et je comprends que le coach IA n&apos;est pas un dispositif médical ni un professionnel de santé.
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button onClick={handleAcknowledge} disabled={!checked || pending}>
        {pending ? "Validation…" : "J'ai compris, continuer"}
      </Button>
    </div>
  );
}
