/**
 * Valide qu'un chemin de redirection fourni par l'utilisateur (query param, champ de formulaire)
 * reste un chemin local relatif. Utilisé partout où une destination de redirection post-connexion
 * transite par le client (`proxy.ts` → formulaire de connexion → `signInAction`, callback OAuth /
 * lien magique) — jamais de confiance aveugle dans une valeur non fiable (open redirect), voir
 * `apps/web/app/auth/callback/route.ts` et `apps/web/app/(auth)/actions.ts` (findings M2/M3, audit
 * Lot L1).
 *
 * `path.startsWith("//")` seul ne suffit pas : `/\evil.com` passe ce contrôle alors que certains
 * navigateurs normalisent l'antislash en barre oblique lors de la résolution d'une URL relative,
 * ce qui peut faire résoudre `Location: /\evil.com` comme `//evil.com` (hôte externe) — même
 * classe de contournement que `//` (finding I5, second audit `code-reviewer`). On rejette donc
 * tout chemin dont le deuxième caractère est `/` OU `\`.
 *
 * Second vecteur, indépendant du premier : les parseurs d'URL conformes WHATWG (donc les
 * navigateurs) suppriment purement et simplement tabulation, retour chariot et saut de ligne de
 * l'URL avant résolution — pas seulement en tête de chaîne. Un chemin comme `/<TAB>/evil.com`
 * contient un unique `/` suivi d'un caractère anodin en apparence, mais devient `//evil.com`
 * (protocol-relative, hôte externe) une fois la tabulation supprimée par le navigateur. On
 * neutralise ce vecteur en rejetant tout caractère de contrôle C0 ou espace, où qu'il soit dans
 * la chaîne (pas seulement en tête).
 */
const UNSAFE_LEADING_PATTERN = /^\/[/\\]/;
// Plage C0 (0x00-0x1F) + espace (0x20), exprimée en points de code pour éviter tout caractère de
// contrôle littéral dans le source.
const CONTROL_OR_WHITESPACE_PATTERN = /[\x00-\x20]/;

export function isSafeRedirectPath(path: string | null | undefined): path is string {
  return (
    !!path &&
    path.startsWith("/") &&
    !UNSAFE_LEADING_PATTERN.test(path) &&
    !CONTROL_OR_WHITESPACE_PATTERN.test(path)
  );
}

export function resolveSafeRedirect(path: string | null | undefined, fallback: string): string {
  return isSafeRedirectPath(path) ? path : fallback;
}
