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
      className={`rounded-lg p-4 text-body ${isAcute ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}
    >
      <p className="text-body-strong font-semibold">{isAcute ? "Douleur à prendre au sérieux" : "Gêne persistante détectée"}</p>
      <p className="mt-1 text-foreground-muted">{notice.message}</p>
    </div>
  );
}
