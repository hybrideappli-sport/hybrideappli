"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * Gestion du consentement santé depuis `/compte` (art. 7.3 RGPD — retrait aussi simple que l'octroi).
 * `active` reflète l'état résolu côté serveur au chargement de la page ; l'action met à jour l'état
 * local pour un retour immédiat, `router.refresh()` resynchronise le reste de la page (bannière de
 * mode dégradé notamment).
 */
export function HealthConsentManager({ active: initialActive }: { active: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant() {
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
        throw new Error(body?.error?.message ?? "Impossible d'enregistrer ce consentement.");
      }
      setActive(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/consents/health_data_processing/revoke", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible de retirer ce consentement.");
      }
      setActive(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4" data-testid="health-consent-manager">
      <p className="text-sm font-medium text-neutral-800">Traitement des données de santé</p>
      <p className="text-sm text-neutral-600">
        Statut actuel :{" "}
        <span className={active ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"} data-testid="health-consent-status">
          {active ? "accordé" : "retiré"}
        </span>
        .
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {active ? (
        <Button variant="secondary" size="sm" onClick={revoke} disabled={pending} data-testid="revoke-health-consent">
          {pending ? "Retrait en cours…" : "Retirer mon consentement"}
        </Button>
      ) : (
        <Button size="sm" onClick={grant} disabled={pending} data-testid="grant-health-consent">
          {pending ? "Enregistrement…" : "Accorder de nouveau mon consentement"}
        </Button>
      )}
    </div>
  );
}
