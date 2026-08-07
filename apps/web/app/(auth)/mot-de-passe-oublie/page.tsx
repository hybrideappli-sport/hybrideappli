import type { Metadata } from "next";

import { ResetRequestForm } from "@/components/auth/reset-request-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Mot de passe oublié — Hybride Club",
};

// Écran S1 (`05-zoning-pencil.md`) : récupération de mot de passe.
export default function ResetPasswordRequestPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
        <CardDescription>
          Indiquez votre e-mail, nous vous envoyons un lien pour le réinitialiser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetRequestForm />
      </CardContent>
    </Card>
  );
}
