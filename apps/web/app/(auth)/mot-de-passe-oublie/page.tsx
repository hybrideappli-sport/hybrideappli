import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetRequestForm } from "@/components/auth/reset-request-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié — Hybride Club",
};

// Écran S1 (`05-zoning-pencil.md`) : récupération de mot de passe.
export default function ResetPasswordRequestPage() {
  return (
    <AuthShell
      title="Mot de passe oublié ?"
      subtitle="Indique ton e-mail, je t'envoie un lien pour en choisir un nouveau."
    >
      <ResetRequestForm />
    </AuthShell>
  );
}
