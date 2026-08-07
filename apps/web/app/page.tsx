import Link from "next/link";

import { Button } from "@/components/ui/button";

// Accueil minimal (Lot L1 — socle). Le contenu marketing complet n'est pas
// dans le périmètre de cette US.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-semibold">Hybride Club</h1>
      <p className="text-neutral-600">
        Un coach IA qui construit et ajuste en continu votre plan d&apos;entraînement et de
        nutrition.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/inscription">Créer un compte</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/connexion">Se connecter</Link>
        </Button>
      </div>
    </main>
  );
}
