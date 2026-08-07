"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signUpAction, initialState);

  if (state.success) {
    return (
      <p className="text-sm text-neutral-700">
        Un e-mail de confirmation vient de vous être envoyé. Ouvrez-le pour activer votre
        compte.
      </p>
    );
  }

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
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Création..." : "Créer mon compte"}
      </Button>
      <p className="text-center text-sm text-neutral-500">
        Déjà un compte ?{" "}
        <Link href="/connexion" className="hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
