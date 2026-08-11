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
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">Mode dégradé — consentement santé non actif</p>
      <p className="mt-1">
        Sans ce consentement, le coach ne peut plus enregistrer tes séances, tes repas ni tes gênes/douleurs — ton plan reste consultable,
        mais il ne s&apos;ajuste plus à tes nouvelles saisies.
      </p>
      <Link href="/compte" className="mt-2 inline-block font-medium text-amber-900 underline underline-offset-2" data-testid="degraded-mode-link">
        Gérer mon consentement
      </Link>
    </div>
  );
}
