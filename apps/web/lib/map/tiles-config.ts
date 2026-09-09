import "server-only";

/**
 * Configuration du fond de carte (ADR-018 §2, §8) — lue UNIQUEMENT côté serveur (`app/(app)/carte
 * /page.tsx`), qui passe ensuite une URL de style déjà résolue à `<MapCanvasDynamic>`. Le garde de
 * palier commercial (`isMapTilesPlanProductionReady`, `tiles-plan-guard.ts`) est un garde SÉPARÉ,
 * appliqué en amont par `apps/web/proxy.ts` — cette fonction ne le revérifie pas, elle suppose
 * qu'elle n'est appelée qu'après son feu vert.
 *
 * FAIL-CLOSED, même patron que `lib/providers/strava/config.ts` : sans `MAP_TILES_STYLE_URL`,
 * aucune carte ne peut être affichée par définition — pas de repli sur un style par défaut, qui
 * romprait l'indirection anti-verrouillage voulue par l'ADR (« changer de fournisseur, c'est
 * changer une variable d'environnement »).
 */
export interface MapTilesConfig {
  /** URL de style MapLibre, clé de fournisseur de tuiles déjà incluse si nécessaire. */
  styleUrl: string;
}

export class MissingMapTilesConfigurationError extends Error {}

export function getMapTilesConfig(): MapTilesConfig {
  const baseStyleUrl = process.env.MAP_TILES_STYLE_URL;
  if (!baseStyleUrl) {
    const message =
      "getMapTilesConfig: MAP_TILES_STYLE_URL manquante — impossible d'afficher la carte (ADR-018 §2, §8). " +
      "Voir .env.local.example.";
    console.error(`[map] ${message}`);
    throw new MissingMapTilesConfigurationError(message);
  }

  // Clé PUBLIQUE par construction (lisible dans le bundle et l'inspecteur réseau — ADR-018,
  // question ouverte n°2 : la restriction par domaine référent, côté fournisseur, est la seule
  // protection réelle). Absente : on part du principe que `MAP_TILES_STYLE_URL` la porte déjà
  // (cas d'un style personnalisé pré-signé), plutôt que d'échouer inutilement.
  const apiKey = process.env.NEXT_PUBLIC_MAP_TILES_API_KEY;
  if (!apiKey) return { styleUrl: baseStyleUrl };

  const separator = baseStyleUrl.includes("?") ? "&" : "?";
  return { styleUrl: `${baseStyleUrl}${separator}api_key=${encodeURIComponent(apiKey)}` };
}
