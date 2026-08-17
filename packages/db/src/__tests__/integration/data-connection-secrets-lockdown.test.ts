import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `docs/db-schema.md` §« Tests attendus » T22, ADR-013 §2 — `data_connection_secrets` (jetons OAuth
 * Strava chiffrés) ne porte AUCUNE policy RLS et `revoke all ... from authenticated, anon` explicite
 * (`0018_data_connections.sql:98-100`), patron `stripe_events`/`job_queue`. Contrairement à ces deux
 * tables (RLS activée SANS policy, mais privilège table conservé via les `alter default privileges`
 * de `0001`), `data_connection_secrets` révoque en plus le privilège table lui-même : la table la
 * plus sensible du lot F2 est donc doublement verrouillée. Fichier manquant relevé par le second
 * audit `code-reviewer` (finding B6, revue post-`aaba499`) — la table la plus sensible n'était
 * couverte par AUCUNE assertion avant B2/B6.
 */

describe("data_connection_secrets — T22, illisible et inécrivable par authenticated", () => {
  let user: TestUser;
  const admin = serviceRoleClient();
  let connectionId: string;
  let secretConnectionId: string;

  beforeAll(async () => {
    user = await createTestUser("secrets-lockdown");

    const { data: connection, error: connectionError } = await admin
      .from("data_connections")
      .insert({ user_id: user.id, provider_code: "strava", status: "active" })
      .select("id")
      .single();
    if (connectionError || !connection) throw connectionError ?? new Error("data_connections: insertion fixture impossible");
    connectionId = connection.id;

    // Ligne de secret RÉELLE (service_role), pour prouver que même une ligne EXISTANTE reste
    // invisible — pas seulement qu'une table vide renvoie 0 ligne par accident.
    const { error: secretError } = await admin.from("data_connection_secrets").insert({
      data_connection_id: connectionId,
      access_token_enc: "\\x00",
      refresh_token_enc: "\\x00",
      access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    if (secretError) throw secretError;
    secretConnectionId = connectionId;
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("SELECT est refusé pour authenticated (permission denied, pas une simple ligne vide)", async () => {
    const { error, data } = await user.client.from("data_connection_secrets").select("*");
    expect(error, "le SELECT aurait dû être rejeté par le revoke table-level, pas juste filtré par RLS").not.toBeNull();
    expect(error?.message ?? "").toMatch(/permission denied/i);
    expect(data ?? []).toEqual([]);
  });

  it("SELECT ciblé sur la ligne existante est aussi refusé", async () => {
    const { error } = await user.client.from("data_connection_secrets").select("*").eq("data_connection_id", secretConnectionId);
    expect(error, "aucun accès, même filtré sur une ligne réelle").not.toBeNull();
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("INSERT est refusé pour authenticated", async () => {
    const { error } = await user.client.from("data_connection_secrets").insert({
      data_connection_id: connectionId,
      access_token_enc: "\\x00",
      refresh_token_enc: "\\x00",
      access_token_expires_at: new Date().toISOString(),
    });
    expect(error, "l'INSERT aurait dû être rejeté").not.toBeNull();
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("UPDATE est refusé pour authenticated", async () => {
    const { error } = await user.client.from("data_connection_secrets").update({ rotated_at: new Date().toISOString() }).eq("data_connection_id", secretConnectionId);
    expect(error, "l'UPDATE aurait dû être rejeté").not.toBeNull();
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("DELETE est refusé pour authenticated", async () => {
    const { error } = await user.client.from("data_connection_secrets").delete().eq("data_connection_id", secretConnectionId);
    expect(error, "le DELETE aurait dû être rejeté").not.toBeNull();
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });
});
