import Link from "next/link";

/**
 * `DegradedModeBanner` — affiché quand le consentement santé n'est pas actif (retiré ou jamais
 * accordé après un onboarding interrompu). Rend le mode dégradé EXPLICITE (question ouverte n°4,
 * `08-architecture.md` §12) plutôt que de laisser l'utilisateur découvrir un `403 CONSENT_REQUIRED`
 * silencieux au premier essai de saisie.
 */
export function DegradedModeBanner() {
  return (
    <div
      role="status"
      data-testid="degraded-mode-banner"
      className="rounded-lg bg-warning/10 p-4 text-body text-warning"
    >
      <p className="text-body-strong font-semibold">Mode dégradé — consentement santé non actif</p>
      <p className="mt-1 text-foreground-muted">
        Sans ce consentement, le coach ne peut plus enregistrer tes séances, tes repas ni tes gênes/douleurs — ton plan reste consultable,
        mais il ne s&apos;ajuste plus à tes nouvelles saisies.
      </p>
      <Link href="/compte" className="mt-2 inline-block text-body-strong font-semibold text-warning underline underline-offset-2" data-testid="degraded-mode-link">
        Gérer mon consentement
      </Link>
    </div>
  );
}
