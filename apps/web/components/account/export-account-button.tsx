"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Art. 15/20 RGPD — export JSON intégral, téléchargé directement par le navigateur. */
export function ExportAccountButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/account/export");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible de générer l'export pour le moment.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "hybride-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button variant="secondary" size="sm" onClick={handleExport} disabled={pending} loading={pending} data-testid="export-account-button">
        {pending ? "Génération…" : "Télécharger mes données (JSON)"}
      </Button>
    </div>
  );
}
