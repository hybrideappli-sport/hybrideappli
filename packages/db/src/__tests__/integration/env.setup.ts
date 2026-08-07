import path from "node:path";
import { config } from "dotenv";

// Charge `.env.local` à la racine du monorepo (gitignoré — voir `.env.local.example`).
// N'échoue jamais si le fichier est absent : en CI, les variables peuvent être
// injectées directement dans l'environnement du runner.
config({ path: path.resolve(import.meta.dirname, "../../../../../.env.local") });

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
]) {
  if (!process.env[name]) {
    throw new Error(
      `[tests d'intégration] Variable ${name} manquante. Démarrez Supabase en local ` +
        `(\`supabase start\`) puis renseignez \`.env.local\` à la racine du monorepo ` +
        `(voir \`.env.local.example\`).`,
    );
  }
}
