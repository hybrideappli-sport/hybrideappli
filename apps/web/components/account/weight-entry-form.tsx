"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * `WeightEntryForm` — AC11, finding I7. Saisie minimale du poids déclaré : c'est la seule mesure
 * lue par `latestWeightKg()` (`packages/rules-engine/src/pipeline/10-build-nutrition-days.ts`),
 * qui calcule les cibles caloriques/macros. Placée dans `/compte` (le « profil ») plutôt que dans
 * l'onboarding conversationnel : ajouter une question au funnel LLM aurait un impact plus large
 * (flow, extraction, tests E2E) pour un lot correctif — voir le rapport de fin de session.
 */
export function WeightEntryForm({ latestWeightKg, measuredOn }: { latestWeightKg: number | null; measuredOn: string }) {
  const router = useRouter();
  const [weight, setWeight] = useState(latestWeightKg !== null ? String(latestWeightKg) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedWeight = Number(weight);
    if (!Number.isFinite(parsedWeight) || parsedWeight < 20 || parsedWeight > 400) {
      setError("Poids invalide (entre 20 et 400 kg).");
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch("/api/v1/body-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measuredOn, weightKg: parsedWeight }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible d'enregistrer ce poids pour le moment.");
      }
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-lg bg-surface p-4" data-testid="weight-entry-form">
      <p className="text-body-strong font-semibold text-foreground">Poids déclaré</p>
      <p className="text-body text-foreground-muted">
        Utilisé pour calculer tes cibles caloriques et macros (AC11) — sans lui, le coach utilise une valeur par défaut générique.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={20}
          max={400}
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          className="w-24"
          aria-label="Poids en kilogrammes"
          data-testid="weight-input"
        />
        <span className="text-body text-foreground-muted">kg</span>
        <Button type="submit" size="sm" disabled={pending} loading={pending} data-testid="weight-submit">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-small text-success" data-testid="weight-saved">
          Poids enregistré.
        </p>
      ) : null}
    </form>
  );
}
