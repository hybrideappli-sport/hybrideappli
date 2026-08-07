import { Client } from "pg";

/**
 * Connexion Postgres directe, réservée à l'introspection du catalogue
 * (`pg_tables`, `pg_policies`, `pg_trigger`) dans les tests d'intégration.
 * Le client applicatif ne parle jamais directement à Postgres (toujours via
 * PostgREST/Supabase) — ceci est un outil de test, pas un pattern à
 * reproduire dans `apps/web` ou les orchestrateurs.
 */
export async function withPgClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
