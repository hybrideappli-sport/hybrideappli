"use client";

import { useActionState } from "react";

import { requestPasswordResetAction, type AuthActionState } from "@/app/(auth)/actions";
import { AUTH_FIELD_CLASS, AuthLink } from "@/components/auth/auth-form-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

// Écran S1 (`05-zoning-pencil.md`) : titre, champ e-mail, bouton principal
// « Envoyer le lien », accessible depuis Accueil.
export function ResetRequestForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" data-testid="reset-success">
        <p className="text-body text-foreground-muted">
          Si un compte existe avec cette adresse, un lien de réinitialisation vient de t&apos;être envoyé.
        </p>
        {/* Le lien reste affiché après l'envoi : sans lui, l'écran de confirmation était un
            cul-de-sac (aucun retour possible sans la barre d'adresse). */}
        <AuthLink href="/connexion">Retour à la connexion</AuthLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate data-testid="reset-form">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className={AUTH_FIELD_CLASS} />
      </div>
      {state.error ? (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} loading={isPending} data-testid="reset-submit">
        {isPending ? "Envoi..." : "Envoyer le lien"}
      </Button>
      <p className="text-center text-small text-foreground-muted">
        <AuthLink href="/connexion">Retour à la connexion</AuthLink>
      </p>
    </form>
  );
}
