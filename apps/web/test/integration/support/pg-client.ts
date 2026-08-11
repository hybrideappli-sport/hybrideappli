import { Client } from "pg";

/**
 * Connexion Postgres directe, réservée au nettoyage de fixtures (`erase_account()`, même
 * contrainte que `packages/db/src/__tests__/integration/support/pg-client.ts` — voir son en-tête).
 * Outil de test uniquement, jamais un pattern applicatif.
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
