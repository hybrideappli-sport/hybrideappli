"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * `DeleteAccountForm` — art. 17 RGPD. « Confirmation forte » exigée côté client
 * (`08-architecture.md` §6.7) : l'utilisateur doit ressaisir EXACTEMENT son adresse e-mail avant
 * que le bouton ne s'active — pas une simple case à cocher, pour une action aussi irréversible que
 * `erase_account()` (suppression réelle en cascade, ADR-010 §8).
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmation.trim().toLowerCase() === email.trim().toLowerCase();

  async function handleDelete() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "La suppression du compte a échoué.");
      }
      // Le compte n'existe plus côté serveur : la session locale est déjà invalide, ce
      // `signOut()` ne fait que purger le cookie côté navigateur avant la redirection.
      await getSupabaseBrowserClient().auth.signOut();
      router.push("/connexion");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4" data-testid="delete-account-form">
      <p className="text-sm font-semibold text-red-800">Supprimer définitivement mon compte</p>
      <p className="text-sm text-red-700">
        Cette action est irréversible : toutes tes données personnelles sont supprimées immédiatement (profil, plans, saisies, historique).
        Seule la preuve de tes consentements est conservée, sous forme anonyme, pour une durée légale de 5 ans.
      </p>
      <label className="text-sm text-red-800" htmlFor="delete-account-confirmation">
        Pour confirmer, saisis ton adresse e-mail (<span className="font-mono">{email}</span>) :
      </label>
      <input
        id="delete-account-confirmation"
        type="email"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        className="rounded-md border border-red-300 px-3 py-2 text-sm"
        data-testid="delete-account-confirmation-input"
        autoComplete="off"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button variant="secondary" size="sm" onClick={handleDelete} disabled={!canSubmit || pending} data-testid="delete-account-submit">
        {pending ? "Suppression…" : "Supprimer définitivement mon compte"}
      </Button>
    </div>
  );
}
