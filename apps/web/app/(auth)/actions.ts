"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase/server";

// Mutations d'authentification — Server Actions réservées aux mutations
// locales à l'UI (ADR-001). Aucune logique métier du coach ici : Supabase
// Auth n'a pas de contrat `/api/v1` dédié dans `08-architecture.md` §6, ces
// actions parlent directement à Supabase Auth (pattern documenté
// @supabase/ssr pour Next.js App Router).

const emailSchema = z.string().trim().email("Adresse e-mail invalide.");
const passwordSchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.");

export type AuthActionState = {
  error: string | null;
  success?: boolean;
};

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { error: null, success: true };
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Mot de passe requis.") })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Identifiants incorrects." };
  }

  redirect("/dashboard");
}

export async function requestPasswordResetAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adresse e-mail invalide." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/callback?next=/mot-de-passe-oublie/nouveau`,
  });

  // Toujours retourner un succès générique, même en cas d'erreur, pour ne
  // pas révéler si un e-mail existe en base (bonne pratique de sécurité).
  if (error) {
    console.error("[auth] resetPasswordForEmail", error.message);
  }

  return { error: null, success: true };
}

export async function updatePasswordAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = passwordSchema.safeParse(formData.get("password"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
