"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
          aria-label="Je consens au traitement de mes données de santé"
        />
        Je consens au traitement de mes données de santé (fréquence cardiaque, sommeil, poids, douleur) pour permettre au coach IA
        d&apos;ajuster mon plan.
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button onClick={handleConsent} disabled={!checked || pending}>
        {pending ? "Validation…" : "J'accepte, continuer"}
      </Button>
    </div>
  );
}
