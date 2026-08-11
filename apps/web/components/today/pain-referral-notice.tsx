import type { PainNoticeView } from "@hybride/domain";

/**
 * `PainReferralNotice` — AC9, niveaux 2 (persistant) et 3 (aigu). JAMAIS derrière le paywall
 * (ADR-008 §5) : affiché indépendamment de l'état d'abonnement, y compris quand le reste du
 * contenu du jour est bloqué (voir `GET /plan/today`, réponse `402` qui porte quand même
 * `activePainNotice`).
 */
export function PainReferralNotice({ notice }: { notice: PainNoticeView }) {
  const isAcute = notice.level === "acute";
  return (
    <div
      role="alert"
      data-testid="pain-referral-notice"
      className={`rounded-lg border p-4 text-sm ${isAcute ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}
    >
      <p className="font-semibold">{isAcute ? "Douleur à prendre au sérieux" : "Gêne persistante détectée"}</p>
      <p className="mt-1">{notice.message}</p>
    </div>
  );
}
