import type { Metadata } from "next";

import { OnboardingCarousel } from "@/components/home/onboarding-carousel";

export const metadata: Metadata = {
  title: "Hybride Club — un seul coach pour tous tes sports",
  description:
    "Course, vélo, natation, muscu : Hybride construit un plan qui tient compte de tout et s'adapte à ta semaine.",
};

/**
 * Accueil (`/`) — porte d'entrée de l'app pour un visiteur non authentifié. Remplace le bloc
 * minimal du Lot L1 (« Accueil minimal — le contenu marketing complet n'est pas dans le
 * périmètre de cette US »), qui n'avait ni maquette, ni logo, ni voix de marque.
 */
export default function HomePage() {
  return <OnboardingCarousel />;
}
