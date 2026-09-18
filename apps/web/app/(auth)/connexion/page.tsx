import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
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
    <AuthShell title="Content de te revoir." subtitle="Ton coach et ton plan du jour t'attendent.">
      <LoginForm redirectTo={isSafeRedirectPath(redirectTo) ? redirectTo : undefined} />
    </AuthShell>
  );
}
