import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";
import { withPgClient } from "./support/pg-client";

/**
 * `enqueue_placement_refresh()` (`0024_session_placements.sql`) est `security definer` : sous
 * `security definer`, `current_user` vaut toujours le PROPRIÉTAIRE de la fonction, jamais
 * l'appelant réel. Le garde d'exclusion posé en `0026_erase_account_placement_refresh_fix.sql`
 * (`pg_has_role(current_user, 'service_role', 'member')`) était donc **inerte** — sa seconde
 * condition est toujours vraie, quel que soit l'appelant (finding N1, seconde passe
 * `code-reviewer`, démontré en exécution). `0027_placement_refresh_guard_jwt_role.sql` corrige
 * le garde en vérifiant la revendication `role` du JWT réellement présenté par l'appelant
 * (`request.jwt.claims`), à l'image du patron déjà appliqué à `erase_account()` elle-même.
 *
 * Ce test reproduit le scénario du reviewer : un `authenticated` qui positionnerait lui-même le
 * GUC `app.erasure_user_id` sur son propre uuid (hors PostgREST — connexion directe, seule
 * surface où un `SET LOCAL` arbitraire est possible) ne doit PLUS neutraliser le trigger pour ses
 * propres écritures. Utilise `withPgClient` : seule une connexion Postgres directe permet de poser
 * `SET LOCAL role`/GUC — impossible depuis un client `supabase-js` (PostgREST).
 */
describe("enqueue_placement_refresh — garde d'exclusion RGPD (N1)", () => {
  let user: TestUser;
  const admin = serviceRoleClient();

  beforeAll(async () => {
    user = await createTestUser("placement-refresh-guard");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("un `authenticated` qui pose lui-même le GUC d'effacement sur son propre uuid n'échappe plus à l'enrôlement du job", async () => {
    const { error: insertError } = await admin
      .from("availability_slots")
      .insert({ user_id: user.id, weekday: 1, slot: "am", is_available: true });
    expect(insertError).toBeNull();

    await admin.from("job_queue").delete().eq("user_id", user.id).eq("kind", "refresh_placements");

    await withPgClient(async (client) => {
      await client.query("begin");
      try {
        // Simule l'identité JWT d'un `authenticated` ordinaire (PAS `service_role`), qui pose lui-
        // même le GUC de contexte d'effacement sur SON PROPRE uuid.
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ role: "authenticated", sub: user.id }),
        ]);
        await client.query("set local role authenticated");
        await client.query("select set_config('app.erasure_user_id', $1, true)", [user.id]);

        const updateResult = await client.query(
          "update public.availability_slots set is_available = false where user_id = $1",
          [user.id],
        );
        // Contrôle : l'UPDATE doit réellement passer la policy RLS (`user_id = auth.uid()`), sans
        // quoi l'absence de job enrôlé ne prouverait rien (le trigger ne se déclenche pas du tout
        // sur zéro ligne affectée).
        expect(updateResult.rowCount, "l'UPDATE aurait dû être accepté par la policy RLS").toBe(1);
      } finally {
        await client.query("commit");
      }
    });

    const { data: jobs, error: jobsError } = await admin
      .from("job_queue")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "refresh_placements");
    expect(jobsError).toBeNull();
    expect(
      jobs?.length,
      "le garde ne doit neutraliser l'enrôlement que pour un appelant `service_role` réel, jamais pour un `authenticated` qui pose lui-même le GUC",
    ).toBe(1);
  });

  it("contrôle positif : `erase_account()` (appelant `service_role` réel) continue de neutraliser l'enrôlement, sans erreur de contrainte", async () => {
    const erasedUser = await createTestUser("placement-refresh-guard-erased");
    const { error: insertError } = await admin
      .from("availability_slots")
      .insert({ user_id: erasedUser.id, weekday: 2, slot: "pm", is_available: true });
    expect(insertError).toBeNull();

    // `erase_account()` cascade sur `auth.users` -> `availability_slots` (DELETE), ce qui aurait
    // échoué avant `0026` (finding B1) et doit rester silencieux ici : ni erreur de contrainte
    // `job_queue_user_id_fkey`, ni job orphelin enrôlé pour un utilisateur déjà supprimé.
    await withPgClient(async (client) => {
      await client.query("begin");
      try {
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ role: "service_role" }),
        ]);
        await client.query("select public.erase_account($1)", [erasedUser.id]);
      } finally {
        await client.query("commit");
      }
    });

    const { data: jobs, error: jobsError } = await admin
      .from("job_queue")
      .select("id")
      .eq("user_id", erasedUser.id)
      .eq("kind", "refresh_placements");
    expect(jobsError).toBeNull();
    expect(jobs?.length, "aucun job de recalcul ne doit être enrôlé pour un compte en cours d'effacement").toBe(0);
  });
});
