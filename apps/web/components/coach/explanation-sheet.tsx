"use client";

import { useState } from "react";
import type { ExplanationDetailView } from "@hybride/domain";

/**
 * `ExplanationSheet` — AC1, AC5 : lien « en savoir plus » qui charge le raisonnement complet
 * (`long_text` + traces) à la demande, jamais au chargement de la page (§6.3 : « jamais de
 * génération à la volée » — ici, jamais de LECTURE anticipée non plus, juste par économie).
 */
export function ExplanationSheet({ explanationId }: { explanationId: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ExplanationDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (detail) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/explanations/${explanationId}`);
      if (!response.ok) throw new Error("Impossible de charger le raisonnement complet pour le moment.");
      const body = (await response.json()) as ExplanationDetailView;
      setDetail(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="text-body-strong font-semibold text-accent underline-offset-4 hover:underline"
        data-testid="explanation-more-link"
      >
        {open ? "Replier" : "En savoir plus →"}
      </button>
      {open ? (
        <div className="mt-2 rounded-md bg-surface-raised p-3 text-small text-foreground-muted" data-testid="explanation-sheet">
          {loading ? <p>Chargement du raisonnement…</p> : null}
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
          {detail ? <p className="whitespace-pre-wrap">{detail.long ?? detail.short}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
