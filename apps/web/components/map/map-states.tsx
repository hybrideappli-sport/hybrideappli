import { ZoomIn } from "lucide-react";

import { formatCountFr, type EmptyStateKind } from "@/lib/map/map-screen-state";

/**
 * États d'écran de `/carte` — ADR-018, lot L3 ; `docs/design-carte.md` §7.
 *
 * Deux gabarits SEULEMENT (§7, intro) : gabarit A (bandeau, transitoire/secondaire — déjà utilisé
 * en L1 pour `zoom_required`/plafond de tuiles/géolocalisation, directement dans `map-canvas.tsx`)
 * et gabarit B (carte centrée, empêche l'affichage de résultats — les composants d'ici). Principe
 * transverse : « jamais un état qui bloque la manipulation de la carte » — tous posés AU-DESSUS du
 * canevas, qui reste manipulable.
 */

function GabaritB({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-5">
      <div
        role="status"
        aria-live="polite"
        data-testid={testId}
        className="pointer-events-auto w-full max-w-[280px] rounded-lg bg-surface p-4 text-center shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

/** §7.3 — les TROIS cas distincts d'« aucun résultat », jamais confondus (`deriveEmptyState`). */
export function EmptyStateCard({ kind, maskedCount, onShowAll }: { kind: EmptyStateKind; maskedCount: number; onShowAll: () => void }) {
  if (kind === "zone-not-mapped") {
    return (
      <GabaritB testId="map-empty-zone-not-mapped">
        <p className="text-body-strong text-foreground">Aucun tracé cartographié ici.</p>
        <p className="mt-1 text-small text-foreground-muted">
          OpenStreetMap ne référence pas de chemin dédié dans cette zone. Déplace la carte ou zoome ailleurs.
        </p>
        <a
          href="https://www.openstreetmap.org/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-small font-semibold text-accent-text underline"
        >
          Contribuer sur OpenStreetMap →
        </a>
      </GabaritB>
    );
  }

  if (kind === "no-filter-active") {
    return (
      <GabaritB testId="map-empty-no-filter-active">
        <p className="text-body-strong text-foreground">Aucun sport sélectionné.</p>
        <p className="mt-1 text-small text-foreground-muted">Choisis au moins un sport pour voir les tracés.</p>
        <button type="button" onClick={onShowAll} className="mt-3 min-h-11 text-small font-semibold text-accent-text">
          Tout afficher
        </button>
      </GabaritB>
    );
  }

  return (
    <GabaritB testId="map-empty-filtered-out">
      <p className="text-body-strong text-foreground">{formatCountFr(maskedCount)} tracés masqués par tes filtres.</p>
      <button type="button" onClick={onShowAll} className="mt-3 min-h-11 text-small font-semibold text-accent-text">
        Tout afficher
      </button>
    </GabaritB>
  );
}

/** §7.2 — zoom insuffisant. Les pastilles restent actives : le filtre est un état persistant, pas
 * une conséquence du zoom (ce composant ne les touche pas, il se pose juste au-dessus du canevas). */
export function ZoomRequiredCard() {
  return (
    <GabaritB testId="map-zoom-required-card">
      <ZoomIn aria-hidden="true" size={24} className="mx-auto text-foreground-muted" />
      <p className="mt-2 text-body-strong text-foreground">Zoome pour voir les tracés</p>
      <p className="mt-1 text-small text-foreground-muted">{"Les chemins s'affichent à partir d'un rayon d'environ 10 km."}</p>
    </GabaritB>
  );
}

/** §7.5 — erreur totale (`502 OVERPASS_UNAVAILABLE`). Le fond de carte reste affiché et
 * manipulable : seuls les tracés sont en panne. */
export function ErrorStateCard({ onRetry }: { onRetry: () => void }) {
  return (
    <GabaritB testId="map-error-state">
      <p className="text-label text-danger">ERREUR</p>
      <p className="mt-2 text-body text-foreground">Les tracés sont indisponibles pour le moment.</p>
      <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-full bg-surface-raised px-5 text-small font-semibold text-foreground">
        Réessayer
      </button>
    </GabaritB>
  );
}

/** §7.9 — hors ligne, affiché AVANT l'échec réseau (aucun service worker en phase 1). */
export function OfflineStateCard() {
  return (
    <GabaritB testId="map-offline-state">
      <p className="text-body-strong text-foreground">Pas de connexion.</p>
      <p className="mt-1 text-small text-foreground-muted">{"La carte a besoin d'internet pour s'afficher."}</p>
    </GabaritB>
  );
}

/** §7.4 — dégradé, PERSISTANT jusqu'au prochain chargement complet réussi. Les tracés obtenus
 * restent affichés : c'est le principe même de la dégradation. Gabarit A (bandeau), posé ici en
 * plus des bandeaux déjà en place en L1 dans `map-canvas.tsx`. */
export function DegradedBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-x-5 top-4 z-10" data-testid="map-degraded-banner" aria-live="polite">
      <div className="rounded-md bg-surface p-3 shadow-lg">
        <p className="text-label text-warning">DONNÉES PARTIELLES</p>
        <p className="mt-1 text-small text-foreground-muted">{"Une partie de la zone n'a pas pu être chargée."}</p>
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 text-small font-semibold text-accent-text">
          Réessayer
        </button>
      </div>
    </div>
  );
}

/** §7.6 — troncature, discrète, jamais silencieuse (ADR-018 §4.4) ni bloquante. */
export function TruncatedBanner() {
  return (
    <div className="pointer-events-none absolute inset-x-5 bottom-32 z-10 text-center" data-testid="map-truncated-banner">
      <p className="text-small text-foreground-subtle">Affichage limité aux tracés les plus proches. Zoome pour tout voir.</p>
    </div>
  );
}
