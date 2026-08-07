"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signInAction, type AuthActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Connexion..." : "Se connecter"}
      </Button>
      <div className="flex justify-between text-sm text-neutral-500">
        <Link href="/inscription" className="hover:underline">
          Créer un compte
        </Link>
        <Link href="/mot-de-passe-oublie" className="hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>
    </form>
  );
}
