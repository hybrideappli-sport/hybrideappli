"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * `DisconnectSheet` — AC10 (`09-design-feature2-notes.md` §3.7). CTA VIOLET, jamais rouge :
 * l'action n'est pas destructive (aucune donnée perdue, tranché le 2026-08-11). `<dialog
 * onClose>`/`showModal()` — piège le focus et ferme à `Échap` nativement, sans réimplémentation.
 */
export function DisconnectSheet({ connectionId, label, onClose }: { connectionId: string; label: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function handleDisconnect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/data/connections/${connectionId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Déconnexion impossible pour le moment.");
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-md rounded-t-xl border-none bg-surface p-5 text-foreground backdrop:bg-black/60"
      data-testid="disconnect-sheet"
    >
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-title text-foreground">Déconnecter {label} ?</h2>
        <p className="text-body text-foreground-muted">
          Tes séances déjà importées restent dans ton historique, elles basculent simplement en saisie déclarée. Seule la
          synchronisation s&apos;arrête.
        </p>
        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}
        <Button onClick={handleDisconnect} disabled={pending} loading={pending} data-testid="disconnect-confirm">
          {pending ? "Déconnexion…" : "Déconnecter"}
        </Button>
        <Button variant="ghost" onClick={() => dialogRef.current?.close()} data-testid="disconnect-cancel">
          Annuler
        </Button>
      </div>
    </dialog>
  );
}
