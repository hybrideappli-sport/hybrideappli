import type { MedicalClearanceNoticeView } from "@hybride/domain";

/**
 * `MedicalClearanceNotice` — AC3, profil à risque (`pathology`/`minor`). Même traitement que
 * `PainReferralNotice` : JAMAIS derrière le paywall (ADR-008 §5), affiché indépendamment de
 * l'état d'abonnement.
 */
export function MedicalClearanceNotice({ notice }: { notice: MedicalClearanceNoticeView }) {
  return (
    <div role="alert" data-testid="medical-clearance-notice" className="rounded-lg bg-warning/10 p-4 text-body text-warning">
      <p className="text-body-strong font-semibold">Avis médical recommandé</p>
      <p className="mt-1 text-foreground-muted">{notice.message}</p>
    </div>
  );
}
