import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = {
  title: "Nouveau mot de passe — Hybride Club",
};

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Nouveau mot de passe." subtitle="Choisis-en un que tu retiendras.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
