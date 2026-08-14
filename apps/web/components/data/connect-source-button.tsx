"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * `ConnectSourceButton` — AC2. Démarre le flux OAuth (`POST /data/connections/:provider/authorize`).
 * `403 CONSENT_REQUIRED` ⟹ redirige vers l'écran de consentement dédié AVANT tout flux OAuth
 * (`09-design-feature2-notes.md` §3.8, ADR-013 §5) — jamais une erreur brute.
 */
export function ConnectSourceButton({ provider, label = "Connecter" }: { provider: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/data/connections/${provider}/authorize`, { method: "POST" });
      if (response.status === 403) {
        router.push(`/donnees/consentement?provider=${provider}`);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Connexion impossible pour le moment.");
      }
      const body = (await response.json()) as { authorizeUrl: string };
      window.location.href = body.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" className="w-full" onClick={handleConnect} disabled={pending} loading={pending} aria-busy={pending} data-testid={`connect-${provider}`}>
        {pending ? "Connexion…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
