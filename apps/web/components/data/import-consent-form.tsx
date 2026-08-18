"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * `ImportConsentForm` — ADR-013 §5. Patron de `HealthConsentForm` (F1), écran BLOQUANT avant tout
 * flux OAuth. Le corps affiché est TOUJOURS `bodyMd` lu en base, jamais un texte codé en dur.
 * Une fois accordé, enchaîne directement sur `authorize` (le consentement s'insère DANS le flux
 * OAuth, pas à côté).
 */
export function ImportConsentForm({ title, bodyMd, provider }: { title: string; bodyMd: string; provider: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConsent() {
    setPending(true);
    setError(null);
    try {
      const consentResponse = await fetch("/api/v1/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "third_party_data_import", granted: true }),
      });
      if (!consentResponse.ok) {
        const body = await consentResponse.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Impossible d'enregistrer ce consentement pour le moment.");
      }

      const authorizeResponse = await fetch(`/api/v1/data/connections/${provider}/authorize`, { method: "POST" });
      if (!authorizeResponse.ok) {
        router.push("/donnees");
        return;
      }
      const body = (await authorizeResponse.json()) as { authorizeUrl: string };
      window.location.href = body.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-8">
      <h1 className="font-serif text-title text-foreground">{title}</h1>
      <Card>
        <CardContent className="max-h-96 overflow-y-auto whitespace-pre-wrap pt-5 text-body text-foreground-muted">{bodyMd}</CardContent>
      </Card>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="peer size-6 shrink-0 appearance-none rounded-sm border-[1.5px] border-border-strong bg-transparent checked:border-accent checked:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            aria-label="Je consens à l'import de données depuis une source tierce"
            aria-describedby={error ? "import-consent-error" : undefined}
          />
          <Check aria-hidden="true" className="pointer-events-none absolute size-4 text-on-accent opacity-0 peer-checked:opacity-100" />
        </span>
        <span className="text-body text-foreground">Je consens à l&apos;import de mes données d&apos;entraînement depuis une source tierce.</span>
      </label>
      {error ? (
        <p id="import-consent-error" role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={handleConsent} disabled={!checked || pending} loading={pending} data-testid="import-consent-accept">
        {pending ? "Validation…" : "J'accepte, continuer"}
      </Button>
    </div>
  );
}
