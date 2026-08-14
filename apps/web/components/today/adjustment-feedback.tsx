"use client";

import type { BodyZone, CreateSessionLogResponse } from "@hybride/domain";

import { ExplanationInline } from "@/components/coach/explanation-inline";
import { PainReferralNotice } from "./pain-referral-notice";

/**
 * `AdjustmentFeedback` — AC4 : retour immédiat après saisie. Affiche l'ajustement éventuel (jamais
 * une hausse ici, invariant ADR-005 §5) et, le cas échéant, l'orientation professionnel de santé
 * AC9 — jamais masquée, quel que soit l'état d'abonnement.
 */
export function AdjustmentFeedback({ result, painZone }: { result: CreateSessionLogResponse; painZone: BodyZone | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-4" data-testid="adjustment-feedback">
      <p className="text-body-strong font-semibold text-foreground">Saisie enregistrée.</p>

      {result.adjustment.applied ? (
        <div className="flex flex-col gap-1" data-testid="adjustment-applied">
          <p className="text-body text-foreground-muted">Le coach a ajusté ta charge à la baisse pour tenir compte de ce signal.</p>
          {result.adjustment.explanation ? (
            <ExplanationInline short={result.adjustment.explanation.short} explanationId={result.adjustment.explanation.explanationId} />
          ) : null}
        </div>
      ) : (
        <p className="text-body text-foreground-muted" data-testid="adjustment-none">
          Aucun ajustement nécessaire pour l&apos;instant.
        </p>
      )}

      {result.painProtocol.referral ? (
        <PainReferralNotice
          notice={{
            zone: painZone ?? "other",
            level: result.painProtocol.level === "acute" ? "acute" : "persistent",
            message: result.painProtocol.referral.message,
          }}
        />
      ) : null}
    </div>
  );
}
