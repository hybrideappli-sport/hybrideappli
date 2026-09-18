import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Créer un compte — Hybride Club",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="On commence ?"
      subtitle="Quelques minutes suffisent pour démarrer ton onboarding avec le coach."
    >
      <SignupForm />
    </AuthShell>
  );
}
