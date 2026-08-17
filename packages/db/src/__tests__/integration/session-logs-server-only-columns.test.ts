import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";
import { withPgClient } from "./support/pg-client";

/**
 * `docs/db-schema.md` §« Tests attendus » T17-T19, ADR-015 §4 — Un client ne fabrique jamais sa
 * provenance (`source`) ni sa charge réalisée (`load_units`) : ce sont des décisions du SERVEUR
 * (`enforce_connected_source_consents()`, `computeLoadUnits()`). `0019_actuals_data_sources.sql`
 * révoque `INSERT` table entière sur `session_logs`/`body_metrics` puis le ré-accorde colonne par
 * colonne (R10). Fichiers manquants relevés par le second audit `code-reviewer` (finding B6, revue
 * post-`aaba499`).
 */

// Colonnes explicitement whitelistées par `grant insert (...)` (`0019_actuals_data_sources.sql`).
const SESSION_LOGS_INSERT_WHITELIST = [
  "user_id",
  "planned_session_id",
  "logged_date",
  "sport_id",
  "session_type",
  "started_at",
  "completion",
  "not_done_reason",
  "actual_duration_min",
  "rpe",
  "freshness",
  "pain",
  "pain_zone",
  "pain_at_rest",
  "comment",
].sort();

const BODY_METRICS_INSERT_WHITELIST = ["user_id", "measured_on", "weight_kg", "resting_hr", "sleep_hours", "hrv_ms"].sort();

describe("session_logs / body_metrics — colonnes serveur exclues de l'INSERT (T17-T19)", () => {
  let user: TestUser;
  const admin = serviceRoleClient();

  beforeAll(async () => {
    user = await createTestUser("server-only-cols");
    // Consentement santé nécessaire pour que la policy `session_logs_insert_own`/`body_metrics_
    // insert_own` (`with check has_active_consent(...)`) ne masque pas le motif réel du rejet
    // attendu ici — le GRANT colonne, vérifié en amont de toute policy.
    const { error } = await admin
      .from("consents")
      .insert({ user_id: user.id, document_code: "health_data_processing", document_version: "1.0.0", granted: true });
    if (error) throw error;
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("T17 — INSERT session_logs avec `source` explicite est rejeté (GRANT colonne)", async () => {
    // `source` est bien TYPÉ côté client (Postgres l'expose dans `information_schema.columns`,
    // que le GRANT colonne autorise l'écriture ou non) : seul le GRANT, vérifié ici en exécution
    // réelle contre PostgREST, protège cette colonne — pas le système de types.
    //
    // Vérifié en exécution directe (`pg`, hors PostgREST) : pour un GRANT partiel par colonne
    // (`revoke insert on ... from authenticated` puis `grant insert (liste) ...`), Postgres élève
    // `permission denied for table session_logs` dès qu'UNE colonne de la liste cible échappe au
    // GRANT — pas le message par-colonne `permission denied for column X of relation Y` (réservé à
    // d'autres verbes). Le texte exact de `docs/db-schema.md` T17 (« for column ») décrit l'INTENTION
    // (le refus est bien porté par le GRANT colonne, pas par une policy RLS) ; l'assertion porte sur
    // ce qui est réellement observable : un refus de privilège (`42501`), jamais silencieux.
    const { error } = await user.client.from("session_logs").insert({ user_id: user.id, logged_date: "2026-08-03", completion: "done", source: "connected" });
    expect(error, "l'INSERT aurait dû être rejeté par le GRANT colonne (source)").not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("T18 — INSERT session_logs avec `load_units` explicite est rejeté (GRANT colonne)", async () => {
    const { error } = await user.client
      .from("session_logs")
      .insert({ user_id: user.id, logged_date: "2026-08-03", completion: "done", load_units: 99999 });
    expect(error, "l'INSERT aurait dû être rejeté par le GRANT colonne (load_units)").not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("INSERT session_logs sans colonne serveur reste accepté (contrôle positif)", async () => {
    const { error } = await user.client.from("session_logs").insert({ user_id: user.id, logged_date: "2026-08-04", completion: "done" });
    expect(error, `l'INSERT nominal aurait dû être accepté : ${error?.message}`).toBeNull();
  });

  it("T19 — inventaire : aucune colonne hors liste blanche n'accorde INSERT à `authenticated` sur session_logs", async () => {
    const grantedColumns = await withPgClient((client) =>
      client
        .query<{ column_name: string }>(
          `select column_name from information_schema.column_privileges
           where table_schema = 'public' and table_name = 'session_logs'
             and grantee = 'authenticated' and privilege_type = 'INSERT'
           order by column_name`,
        )
        .then((r) => r.rows.map((row) => row.column_name)),
    );
    expect(grantedColumns.sort()).toStrictEqual(SESSION_LOGS_INSERT_WHITELIST);
  });

  it("T19 — inventaire : aucune colonne hors liste blanche n'accorde INSERT à `authenticated` sur body_metrics", async () => {
    const grantedColumns = await withPgClient((client) =>
      client
        .query<{ column_name: string }>(
          `select column_name from information_schema.column_privileges
           where table_schema = 'public' and table_name = 'body_metrics'
             and grantee = 'authenticated' and privilege_type = 'INSERT'
           order by column_name`,
        )
        .then((r) => r.rows.map((row) => row.column_name)),
    );
    expect(grantedColumns.sort()).toStrictEqual(BODY_METRICS_INSERT_WHITELIST);
  });
});
