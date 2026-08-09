import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceRoleClient } from "../../../client/service-role";
import type { Database } from "../../../types";
import { withPgClient } from "./pg-client";

/**
 * Client `service_role` — contourne RLS. Utilisé dans les tests pour seeder
 * des fixtures et pour l'introspection (jamais pour vérifier une isolation).
 */
export function serviceRoleClient() {
  return createSupabaseServiceRoleClient();
}

function anonUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL as string;
}

function anonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
}

export type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
};

/**
 * Crée un utilisateur de test confirmé (via `service_role`) puis retourne un
 * client authentifié en son nom (clé anon + session), pour exercer les
 * policies RLS exactement comme un utilisateur réel (`auth.uid()` peuplé).
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = serviceRoleClient();
  const email = `${label}-${randomUUID()}@hybride.test`;
  const password = `Test-${randomUUID()}-Aa1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`[test] création de l'utilisateur de test impossible : ${error?.message}`);
  }

  const client = createClient<Database>(anonUrl(), anonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`[test] connexion impossible pour ${email} : ${signInError.message}`);
  }

  return { id: data.user.id, email, client };
}

/**
 * Nettoyage de fin de test. `plan_versions` et `decision_traces` portent un trigger
 * `forbid_mutation()` (voir `docs/db-schema.md` §0.3) qui bloque UPDATE/DELETE « y compris pour
 * `service_role », hors contexte d'effacement RGPD dédié (`erase_account()`, ADR-010 §8). Ces
 * deux tables référencent `auth.users(id) on delete cascade` : supprimer un utilisateur de test
 * déclenche donc une tentative de DELETE en cascade, que le trigger rejette systématiquement en
 * dehors de ce contexte — y compris via `auth.admin.deleteUser()`. (`consents` n'a plus de FK vers
 * `auth.users` depuis l'arbitrage `architect` du 2026-08-07 — ADR-010 §8 : le registre de
 * consentement survit à la suppression du compte, il n'est donc plus concerné par cette cascade.)
 *
 * CORRECTION (finding B3, second audit `code-reviewer`, mesuré en exécution) : la version
 * précédente désactivait TOUS les triggers via `set local session_replication_role = 'replica'`
 * avant le `delete from auth.users`, y compris les triggers système qui portent les contraintes
 * de clé étrangère — la suppression ne cascadait donc plus sur RIEN, laissant des lignes
 * orphelines dans 27 tables après seulement 3 exécutions. On utilise désormais `erase_account()`
 * (ADR-010 §8), qui déclenche un vrai `delete from auth.users` avec triggers actifs — cascade
 * réelle, vérifiée sans résidu.
 *
 * `erase_account()` est `security definer` et vérifie la revendication JWT `role` de l'appelant
 * (finding B1, ci-dessus) — inexistante sur cette connexion `pg` directe (`DATABASE_URL`, hors
 * PostgREST). On pose donc manuellement `request.jwt.claims` pour simuler un appelant
 * `service_role`, dans la même transaction que l'appel.
 *
 * `erase_account()` pseudonymise `consents` plutôt que de le supprimer (conservation légale de
 * 5 ans, ADR-010 §8) : entre deux exécutions de test, ces lignes s'accumuleraient sans jamais être
 * nettoyées. Le GUC `app.erasure_user_id` posé par `erase_account()` (`set local`, portée
 * transactionnelle) reste actif pour le reste de CETTE transaction : `forbid_mutation()` autorise
 * donc ce DELETE explicite ici, et seulement ici — motif suggéré par le reviewer.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  await withPgClient(async (client) => {
    await client.query("begin");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "service_role" }),
      ]);
      // `plan_reviews.reviewer_id` est `on delete set null` (la revue qualité survit à
      // l'effacement du reviewer) : cette suppression explicite n'est pas requise pour éviter une
      // erreur de contrainte, mais elle évite de laisser traîner des lignes de revue orphelines
      // entre exécutions de test.
      await client.query("delete from plan_reviews where reviewer_id = $1", [userId]);
      await client.query("select public.erase_account($1)", [userId]);
      await client.query("delete from public.consents where user_id = $1", [userId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}
