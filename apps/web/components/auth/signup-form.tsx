"use client";

import { useActionState } from "react";

import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { AUTH_FIELD_CLASS, AuthLink } from "@/components/auth/auth-form-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" data-testid="signup-success">
        <p className="text-body text-foreground-muted">
          Un e-mail de confirmation vient de t&apos;être envoyé. Ouvre-le pour activer ton compte.
        </p>
        <AuthLink href="/connexion">Retour à la connexion</AuthLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate data-testid="signup-form">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className={AUTH_FIELD_CLASS} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={AUTH_FIELD_CLASS}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} loading={isPending} data-testid="signup-submit">
        {isPending ? "Création..." : "Créer mon compte"}
      </Button>
      <p className="text-center text-small text-foreground-muted">
        Déjà un compte ? <AuthLink href="/connexion">Se connecter</AuthLink>
      </p>
    </form>
  );
}
