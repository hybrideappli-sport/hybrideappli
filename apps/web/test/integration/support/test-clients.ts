import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@hybride/db/server";
import type { Database } from "@hybride/db";

import { withPgClient } from "./pg-client";

/**
 * Client `service_role` — contourne RLS. Mêmes garanties que
 * `packages/db/src/__tests__/integration/support/test-clients.ts` (voir son en-tête) : utilisé
 * pour seeder des fixtures et pour l'introspection, jamais pour vérifier une isolation.
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

/** Crée un utilisateur de test confirmé (`service_role`) puis un client authentifié en son nom. */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = serviceRoleClient();
  const email = `${label}-${randomUUID()}@hybride.test`;
  const password = `Test-${randomUUID()}-Aa1!`;

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    throw new Error(`[test] création de l'utilisateur de test impossible : ${error?.message}`);
  }

  const client = createClient<Database>(anonUrl(), anonKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`[test] connexion impossible pour ${email} : ${signInError.message}`);
  }

  return { id: data.user.id, email, client };
}

/**
 * Nettoyage de fin de test — même mécanisme que `packages/db` (voir son en-tête pour le détail
 * complet) : `erase_account()` via une connexion `pg` directe, `request.jwt.claims` simulé pour
 * satisfaire la vérification `role = 'service_role'` de la fonction.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  await withPgClient(async (client) => {
    await client.query("begin");
    try {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await client.query("select public.erase_account($1)", [userId]);
      await client.query("delete from public.consents where user_id = $1", [userId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/**
 * Consentement santé actif (`health_data_processing`) + acquittement du disclaimer médical
 * (`medical_disclaimer`) — préalable RLS réel (`has_active_consent()`, `0002_identity_consents.sql`
 * §`athlete_profiles`/`session_logs`/…) à toute écriture via un client `rls` (authentifié), pas
 * seulement `service_role`. Écrit directement en base (`service_role`, aucune policy INSERT sur
 * `consents` — voir son en-tête) plutôt que de repasser par `POST /api/v1/consents` (dépend de
 * `next/headers`, hors de portée d'un test d'intégration, voir `paywall.test.ts`). Cible la version
 * `'1.0.0'`/`'fr'` réellement activée par `supabase/seed.sql` (`consent_documents.is_current`).
 */
export async function grantHealthConsents(admin: SupabaseClient<Database>, userId: string): Promise<void> {
  const { error } = await admin.from("consents").insert(
    (["medical_disclaimer", "health_data_processing"] as const).map((code) => ({
      user_id: userId,
      document_code: code,
      document_version: "1.0.0",
      locale: "fr",
      granted: true,
    })),
  );
  if (error) throw new Error(`[test] consents (seed) : ${error.message}`);
}

/** Sport de référence seedé (`0010_seed_referentials.sql`) — utilisé pour peupler `athlete_sports`/`objectives`. */
export async function seedSportId(admin: SupabaseClient<Database>, code = "running"): Promise<string> {
  const { data, error } = await admin.from("sports").select("id").eq("code", code).single();
  if (error || !data) throw new Error(`[test] référentiel sports introuvable pour code='${code}' : ${error?.message}`);
  return data.id;
}

/**
 * Profil déclaratif minimal + objectif RÉALISTE par défaut (sans `target_date`/`targetWeeklyHours`
 * explicite ⟹ `evaluateObjectiveFeasibility` retombe toujours sur `'realistic'`, voir son en-tête)
 * — suffisant pour que `regeneratePlan()`/`runWeeklyReview()` produisent un plan complet sans
 * jamais bifurquer vers la négociation AC2, hors du périmètre des tests de ce module.
 */
export async function seedAthleteAndObjective(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<{ objectiveId: string; sportId: string }> {
  const sportId = await seedSportId(admin);

  const { error: profileError } = await admin.from("athlete_profiles").insert({
    user_id: userId,
    experience_level: "beginner",
    declared_weekly_hours: 5,
    declared_weekly_sessions: 3,
    sex_at_birth: "male",
    height_cm: 178,
  });
  if (profileError) throw new Error(`[test] athlete_profiles : ${profileError.message}`);

  const { error: sportsError } = await admin
    .from("athlete_sports")
    .insert({ user_id: userId, sport_id: sportId, level: "beginner", is_primary: true });
  if (sportsError) throw new Error(`[test] athlete_sports : ${sportsError.message}`);

  const { data: objective, error: objectiveError } = await admin
    .from("objectives")
    .insert({ user_id: userId, sport_id: sportId, kind: "general_fitness", label: "Fixture objective" })
    .select("id")
    .single();
  if (objectiveError) throw new Error(`[test] objectives : ${objectiveError.message}`);

  return { objectiveId: objective.id, sportId };
}
