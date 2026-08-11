import type { MedicalClearanceNoticeView } from "@hybride/domain";

/**
 * `MedicalClearanceNotice` — AC3, profil à risque (`pathology`/`minor`). Même traitement que
 * `PainReferralNotice` : JAMAIS derrière le paywall (ADR-008 §5), affiché indépendamment de
 * l'état d'abonnement.
 */
export function MedicalClearanceNotice({ notice }: { notice: MedicalClearanceNoticeView }) {
  return (
    <div role="alert" data-testid="medical-clearance-notice" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Avis médical recommandé</p>
      <p className="mt-1">{notice.message}</p>
    </div>
  );
}
