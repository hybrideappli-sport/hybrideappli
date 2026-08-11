/**
 * Lecture centralisée des variables d'environnement Supabase.
 *
 * Aucun secret en dur : tout passe par `process.env` (voir `08-architecture.md` §8 « Sécurité,
 * RGPD, RLS » et `docs/db-schema.md` pour le détail du schéma). `SUPABASE_SERVICE_ROLE_KEY` ne
 * doit jamais être exposé au bundle client — seules les fonctions serveur de ce package y
 * accèdent (voir `./client/service-role.ts`, importé exclusivement via `@hybride/db/server`).
 * Correction du finding M8 (audit Lot L1) : cette référence pointait vers un `CLAUDE.md`
 * §Sécurité inexistant à la racine du repo.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[@hybride/db] Variable d'environnement manquante : ${name}. Voir .env.local.example.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
