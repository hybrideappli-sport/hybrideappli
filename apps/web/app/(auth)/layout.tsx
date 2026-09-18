/**
 * Les 4 écrans d'auth portent chacun leur propre coque plein écran (`AuthShell` : photo,
 * voile, logo, titre serif). Ce layout ne fait plus que traverser — le centrage et la
 * gouttière vivent dans la coque, au même endroit que pour l'accueil.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
