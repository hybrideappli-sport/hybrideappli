/**
 * Viseur de sélection clavier — ADR-018, lot L3 ; `docs/design-carte.md` §5.4.1.
 *
 * OBLIGATOIRE : c'est l'alternative d'accessibilité exigée par ADR-018 L3 au tap sur un tracé
 * (remplace le panneau « Liste des tracés », abandonné le 2026-09-09 — trop de tracés pour tenir
 * dans une liste plafonnée). N'apparaît que lorsque le canevas a le focus CLAVIER
 * (`useTrailSelection().viewfinderVisible`, piloté par `:focus-visible`) : jamais en usage tactile.
 *
 * `pointer-events-none` : c'est un repère, pas un contrôle (§5.4.1, « cible tactile : aucune »).
 */
export function ViewfinderOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" data-testid="map-viewfinder" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24">
        {/* Détourage noir, à l'intérieur et à l'extérieur du cercle blanc — même doctrine que le
            halo de trait (§2.2) : le contraste devient indépendant du fond survolé. */}
        <circle cx="12" cy="12" r="11" fill="none" stroke="#0a0a0a" strokeWidth="1" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="#0a0a0a" strokeWidth="1" />
        <circle cx="12" cy="12" r="10" fill="none" stroke="#ffffff" strokeWidth="2" />

        {/* Croix centrale : 2 branches de 6 px, vide de 4 px au centre pour ne pas masquer le tracé visé. */}
        <line x1="12" y1="2" x2="12" y2="8" stroke="#0a0a0a" strokeWidth="2.5" />
        <line x1="12" y1="16" x2="12" y2="22" stroke="#0a0a0a" strokeWidth="2.5" />
        <line x1="2" y1="12" x2="8" y2="12" stroke="#0a0a0a" strokeWidth="2.5" />
        <line x1="16" y1="12" x2="22" y2="12" stroke="#0a0a0a" strokeWidth="2.5" />

        <line x1="12" y1="2" x2="12" y2="8" stroke="#ffffff" strokeWidth="1.5" />
        <line x1="12" y1="16" x2="12" y2="22" stroke="#ffffff" strokeWidth="1.5" />
        <line x1="2" y1="12" x2="8" y2="12" stroke="#ffffff" strokeWidth="1.5" />
        <line x1="16" y1="12" x2="22" y2="12" stroke="#ffffff" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/**
 * §5.4.2 — « aide visible à la prise de focus » : indécouvrables sans elle, les raccourcis `N`/`P`
 * exigent une seconde mesure en plus de l'`aria-label` du canevas. Retirée à la perte de focus —
 * elle ne coûte donc rien à l'écran mobile, où le canevas ne prend jamais le focus clavier.
 */
export function ViewfinderHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-5" data-testid="map-viewfinder-hint">
      <p className="rounded-full bg-surface-raised px-4 py-2 text-center text-small text-foreground-muted shadow-lg">
        Entrée : sélectionner au centre · N / P : tracé suivant · Échap : désélectionner
      </p>
    </div>
  );
}
