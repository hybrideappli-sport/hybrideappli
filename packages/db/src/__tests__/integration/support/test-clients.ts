import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceRoleClient } from "../../../client/service-role";
import type { Database } from "../../../types";
import { withPgClient } from "./pg-client";

/**
 * Tables portant un trigger `forbid_mutation()` — voir `08-architecture.md` §5 : le trigger
 * bloque UPDATE/DELETE « y compris pour `service_role` ». Or `consents`, `plan_versions` et
 * `decision_traces` référencent `auth.users(id) on delete cascade` : supprimer un utilisateur de
 * test déclenche donc une tentative de DELETE en cascade sur ces tables, que le trigger rejette
 * systématiquement — y compris via `auth.admin.deleteUser()`. C'est cohérent avec l'intention
 * produit (`08-architecture.md` §6.7 : suppression RGPD = « cascade + anonymisation des traces
 * statistiques », jamais une suppression physique brute des traces). Le nettoyage de fin de test
 * ci-dessous désactive donc ponctuellement ces triggers via une connexion Postgres superuser
 * (réservée aux tests locaux) plutôt que de les contourner en production.
 */
const IMMUTABLE_TRIGGERS = [
  { table: "consents", trigger: "consents_immutable" },
  { table: "plan_versions", trigger: "plan_versions_immutable" },
  { table: "decision_traces", trigger: "decision_traces_immutable" },
];

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

export async function deleteTestUser(userId: string): Promise<void> {
  await withPgClient(async (client) => {
    try {
      for (const { table, trigger } of IMMUTABLE_TRIGGERS) {
        await client.query(`alter table ${table} disable trigger ${trigger}`);
      }
      // `plan_reviews.reviewer_id` référence `auth.users(id)` SANS `on delete cascade`
      // (08-architecture.md §5.8) : à la différence des autres FK de ce schéma, une
      // suppression d'utilisateur échoue tant qu'une ligne le référence comme reviewer.
      await client.query("delete from plan_reviews where reviewer_id = $1", [userId]);
      await client.query("delete from auth.users where id = $1", [userId]);
    } finally {
      for (const { table, trigger } of IMMUTABLE_TRIGGERS) {
        await client.query(`alter table ${table} enable trigger ${trigger}`);
      }
    }
  });
}
