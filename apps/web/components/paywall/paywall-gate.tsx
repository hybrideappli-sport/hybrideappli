import type { ReactNode } from "react";

/**
 * `PaywallGate` — Server Component, AC13. Rend `children` UNIQUEMENT si `entitled` est vrai ;
 * sinon rend `fallback`. Composant volontairement passif : il n'appelle jamais `requireEntitlement()`
 * lui-même (l'autorité reste `apps/web/lib/entitlements.ts`, côté page/Route Handler), il ne fait
 * qu'appliquer la décision déjà prise.
 *
 * « N'affiche pas de contenu qu'il masque » : quand `entitled` est faux, `children` n'est jamais
 * la valeur retournée par ce composant. React (Server Components) ne descend donc jamais dans cet
 * arbre pour le rendre — son contenu n'entre jamais dans la charge RSC envoyée au navigateur, même
 * masqué par du CSS. Condition nécessaire côté appelant : ne construire `children` avec des
 * données protégées qu'après avoir déjà vérifié `entitled` (ne pas fetcher « au cas où »).
 */
export function PaywallGate({ entitled, fallback, children }: { entitled: boolean; fallback: ReactNode; children: ReactNode }) {
  return entitled ? children : fallback;
}
