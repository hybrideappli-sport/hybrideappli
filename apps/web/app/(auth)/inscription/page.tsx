import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Créer un compte — Hybride Club",
};

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
        <CardDescription>
          Quelques minutes suffisent pour démarrer votre onboarding avec le coach IA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
