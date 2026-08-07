import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Connexion — Hybride Club",
};

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Retrouvez votre coach IA et votre plan du jour.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
