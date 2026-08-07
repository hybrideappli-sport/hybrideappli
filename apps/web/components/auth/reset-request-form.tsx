"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  requestPasswordResetAction,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

// Écran S1 (`05-zoning-pencil.md`) : titre, champ e-mail, bouton principal
// « Envoyer le lien », accessible depuis Accueil.
export function ResetRequestForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.success) {
    return (
      <p className="text-sm text-neutral-700">
        Si un compte existe avec cette adresse, un lien de réinitialisation vient de vous
        être envoyé.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Envoi..." : "Envoyer le lien"}
      </Button>
      <p className="text-center text-sm text-neutral-500">
        <Link href="/connexion" className="hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
