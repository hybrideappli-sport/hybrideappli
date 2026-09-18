"use client";

import { useActionState } from "react";

import { signInAction, type AuthActionState } from "@/app/(auth)/actions";
import { AUTH_FIELD_CLASS, AuthLink } from "@/components/auth/auth-form-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

type LoginFormProps = {
  /** Destination post-connexion d'origine, déposée par `proxy.ts` (finding M2, audit Lot L1). */
  redirectTo?: string;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate data-testid="login-form">
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
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
          autoComplete="current-password"
          required
          className={AUTH_FIELD_CLASS}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} loading={isPending} data-testid="login-submit">
        {isPending ? "Connexion..." : "Se connecter"}
      </Button>
      <div className="flex items-center justify-center gap-3 text-small text-foreground-muted">
        <AuthLink href="/inscription">Créer un compte</AuthLink>
        <span aria-hidden="true" className="text-foreground-subtle">
          ·
        </span>
        <AuthLink href="/mot-de-passe-oublie">Mot de passe oublié ?</AuthLink>
      </div>
    </form>
  );
}
