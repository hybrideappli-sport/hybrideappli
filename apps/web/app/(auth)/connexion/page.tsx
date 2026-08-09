import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Connexion — Hybride Club",
};

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>Retrouvez votre coach IA et votre plan du jour.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm redirectTo={isSafeRedirectPath(redirectTo) ? redirectTo : undefined} />
      </CardContent>
    </Card>
  );
}
