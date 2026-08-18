"use client";

import { useState } from "react";

/**
 * `ReportIncidentButton` — `10-design-feature3-notes.md` §1.7. Bouton TERTIAIRE, aucun champ,
 * aucune modale, aucune confirmation : le clic déclenche directement le réajustement (décision du
 * fondateur du 2026-08-11, AC3). Le résultat annoncé en `aria-live="polite"` EST le retour UI —
 * jamais un toast.
 */
export function ReportIncidentButton({
  plannedSessionId,
  sessionLabel,
  disabled,
  onResolved,
}: {
  plannedSessionId: string;
  sessionLabel: string;
  disabled?: boolean;
  onResolved: (outcome: { message: string }) => void;
}) {
  const [state, setState] = useState<"default" | "loading" | "error">("default");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/v1/schedule/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedSessionId }),
      });
      if (!response.ok) {
        if (response.status === 500) {
          setState("error");
          setErrorMessage("Le replacement n'a pas pu être calculé. Réessayer.");
          return;
        }
        setState("error");
        setErrorMessage("Cette séance ne peut plus être signalée.");
        return;
      }
      const body = (await response.json()) as { message: string };
      setState("default");
      onResolved({ message: body.message });
    } catch {
      setState("error");
      setErrorMessage("Le replacement n'a pas pu être calculé. Réessayer.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state === "loading"}
        aria-disabled={disabled || state === "loading"}
        aria-busy={state === "loading"}
        aria-label={`Signaler un imprévu sur la séance ${sessionLabel}`}
        className="min-h-11 py-3 text-left text-small font-normal text-accent-text hover:text-accent-hover disabled:cursor-not-allowed disabled:text-foreground-subtle"
        data-testid="report-incident-button"
      >
        {state === "loading" ? "Je cherche un créneau…" : "Signaler un imprévu"}
      </button>
      {state === "error" && errorMessage ? (
        <p className="text-small text-danger" role="alert" data-testid="report-incident-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
