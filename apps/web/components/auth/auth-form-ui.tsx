import Link from "next/link";

/**
 * Pièces partagées par les quatre formulaires d'authentification.
 *
 * Séparées de `auth-shell.tsx` à dessein : la coque est un Server Component (photo, voile,
 * logo, titres) et les formulaires sont des Client Components. Les importer depuis le même
 * module aurait tiré la coque entière dans le bundle client sans aucun bénéfice.
 */

/**
 * Habillage des champs posés directement sur la photo — pas de carte. Fond semi-opaque plus
 * clair que son environnement + flou d'arrière-plan : le champ se lit comme une zone de saisie
 * sans redevenir un panneau opaque.
 *
 * `--autofill-bg` est lu par la règle `input:-webkit-autofill` de `globals.css`. Chrome impose
 * un fond bleu clair aux champs auto-remplis et ignore `background-color` ; seule une ombre
 * interne épaisse le recouvre, et elle ne peut pas être translucide. La valeur ci-dessous est
 * la couleur MESURÉE du champ composité sur la photo voilée : à l'écran, l'auto-remplissage
 * est indiscernable de la saisie manuelle (0,7 niveau d'écart sur 255).
 *
 * Cette composite varie de ±9 niveaux d'un écran à l'autre — le champ ne tombe pas à la même
 * hauteur sur la photo. La valeur retenue est celle de `/connexion` et `/inscription`, les deux
 * seuls écrans où le navigateur propose réellement un auto-remplissage.
 */
export const AUTH_FIELD_CLASS =
  "border-white/25 bg-white/10 backdrop-blur-sm placeholder:text-foreground-subtle [--autofill-bg:#363a3a]";

/** Lien secondaire de bas d'écran — gris clair sur photo voilée, cible tactile de 44 px. */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center text-small text-foreground-muted underline-offset-4 hover:text-foreground hover:underline"
    >
      {children}
    </Link>
  );
}
