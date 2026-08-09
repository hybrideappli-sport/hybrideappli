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
 * Pour nettoyer malgré tout les données de test sans passer par `erase_account()` (qui supprime
 * bien plus que ce dont un test a besoin), on désactive les triggers **pour la durée de cette
 * transaction uniquement** via `set local session_replication_role = 'replica'` — portée
 * strictement transactionnelle (s'annule d'elle-même au COMMIT/ROLLBACK, et de toute façon à la
 * déconnexion), par opposition à `alter table ... disable trigger ...` (DDL global et persistant,
 * visible de toute connexion concurrente jusqu'au `enable trigger` correspondant — dangereux en
 * cas d'exécution concurrente ou d'interruption avant qu'il ne s'exécute). Correction du finding
 * I7, audit Lot L1.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  await withPgClient(async (client) => {
    await client.query("begin");
    try {
      await client.query("set local session_replication_role = 'replica'");
      // `plan_reviews.reviewer_id` est désormais `on delete set null` (arbitrage `architect` du
      // 2026-08-07 : la revue qualité survit à l'effacement du reviewer) : cette suppression
      // explicite n'est plus requise pour éviter une erreur de contrainte, mais elle évite de
      // laisser traîner des lignes de revue orphelines entre exécutions de test.
      await client.query("delete from plan_reviews where reviewer_id = $1", [userId]);
      await client.query("delete from auth.users where id = $1", [userId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}
