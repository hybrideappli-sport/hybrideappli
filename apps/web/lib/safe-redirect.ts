/**
 * Valide qu'un chemin de redirection fourni par l'utilisateur (query param, champ de formulaire)
 * reste un chemin local relatif. Utilisé partout où une destination de redirection post-connexion
 * transite par le client (`proxy.ts` → formulaire de connexion → `signInAction`, callback OAuth /
 * lien magique) — jamais de confiance aveugle dans une valeur non fiable (open redirect), voir
 * `apps/web/app/auth/callback/route.ts` et `apps/web/app/(auth)/actions.ts` (findings M2/M3, audit
 * Lot L1).
 */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

export function resolveSafeRedirect(path: string | null | undefined, fallback: string): string {
  return isSafeRedirectPath(path) ? path : fallback;
}
