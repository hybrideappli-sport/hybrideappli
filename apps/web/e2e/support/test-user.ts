import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Playwright charge les specs/support en CJS (voir `playwright.config.ts`) : `__dirname`, pas
// `import.meta.dirname`.
declare const __dirname: string;

// Charge `apps/web/.env.local` (gitignoré) — mêmes identifiants Supabase locaux que le serveur
// `next dev` démarré par Playwright (`webServer` dans `playwright.config.ts`).
config({ path: path.resolve(__dirname, "../../.env.local") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[e2e] Variable ${name} manquante — démarrez Supabase en local (\`supabase start\`).`);
  }
  return value;
}

/**
 * Crée un utilisateur de test confirmé via `service_role`, en dehors du navigateur Playwright
 * (plus rapide et plus fiable que de passer par l'écran d'inscription + confirmation e-mail).
 * L'authentification RÉELLE (cookies `@supabase/ssr`) se fait ensuite via le formulaire de
 * connexion, dans le navigateur (voir `signIn()` ci-dessous) — jamais en fabriquant un cookie à la
 * main, qui serait fragile et dépendant de détails d'implémentation de `@supabase/ssr`.
 */
export async function createConfirmedTestUser(label: string): Promise<{ email: string; password: string }> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const email = `${label}-${randomUUID()}@hybride.test`;
  const password = `Test-${randomUUID()}-Aa1!`;

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`[e2e] création de l'utilisateur de test impossible : ${error.message}`);

  return { email, password };
}
