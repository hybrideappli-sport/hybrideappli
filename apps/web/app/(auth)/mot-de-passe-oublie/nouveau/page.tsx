import type { Metadata } from "next";

import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Nouveau mot de passe — Hybride Club",
};

export default function UpdatePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouveau mot de passe</CardTitle>
        <CardDescription>Choisissez un nouveau mot de passe pour votre compte.</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
