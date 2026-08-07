/**
 * Lecture centralisée des variables d'environnement Supabase.
 *
 * Aucun secret en dur : tout passe par `process.env` (voir CLAUDE.md
 * §Sécurité, `08-architecture.md` §8). `SUPABASE_SERVICE_ROLE_KEY` ne doit
 * jamais être exposé au bundle client — seules les fonctions serveur de ce
 * package y accèdent.
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
