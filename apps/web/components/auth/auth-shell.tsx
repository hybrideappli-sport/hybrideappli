import Image from "next/image";

/**
 * `AuthShell` — coque commune aux 4 écrans d'authentification. Prolonge l'écran d'accueil
 * (`components/home/onboarding-carousel.tsx`) : même photo de fond, même logo, même gouttière
 * de 24 px, mêmes titres serif.
 *
 * Les écrans d'auth n'ont jamais eu de maquette Pencil et étaient restés des `<Card>` shadcn
 * nues sur fond noir — rupture brutale juste après le carrousel.
 *
 * Différence assumée avec l'accueil : le voile est nettement plus appuyé. Sur l'accueil la
 * photo porte le propos ; ici elle n'est qu'une toile de fond, le formulaire prime.
 */

/** Voile d'auth, plus dense que celui de l'accueil. Le profil suit la photo et non l'intuition :
 *  sur `02-natation`, le ciel du haut est surexposé (L = 0,94 mesurée) tandis que le bas — eau et
 *  reflet — est déjà sombre (L = 0,09). Le voile est donc le PLUS fort en haut, là où le blanc
 *  brûle, et se relâche au milieu pour laisser le nageur et les montagnes exister. Valeurs
 *  vérifiées au contraste sur le rendu réel, pas estimées. */
const AUTH_SCRIM =
  "linear-gradient(to bottom, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.82) 30%, rgba(0,0,0,0.73) 55%, rgba(0,0,0,0.78) 80%, rgba(0,0,0,0.86) 100%)";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-background px-6">
      <Image
        src="/assets/onboarding/02-natation.webp"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="-z-10 object-cover"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ background: AUTH_SCRIM }} />

      {/* Logo posé exactement où l'accueil le place, pour qu'il ne saute pas d'un écran à
          l'autre. Il reste dans le flux (et non en absolu) afin de ne jamais recouvrir le
          formulaire sur un écran court. */}
      <div
        className="flex shrink-0 justify-center"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.75rem)" }}
      >
        <Image
          src="/assets/brand/logo-mark-white.png"
          alt="Hybride Club"
          width={44}
          height={44}
          priority
          className="h-11 w-11"
        />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-9 py-12">
        <header className="flex flex-col gap-2 text-center">
          <h1 className="font-serif text-title text-foreground">{title}</h1>
          <p className="text-body text-foreground-muted">{subtitle}</p>
        </header>

        {children}
      </div>
    </div>
  );
}
