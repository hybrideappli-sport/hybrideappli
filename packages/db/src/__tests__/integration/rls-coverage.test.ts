import { describe, expect, it } from "vitest";

import { withPgClient } from "./support/pg-client";

/**
 * Tables intentionnellement sans policy : accès strictement réservé au
 * `service_role`, RLS activée quand même (règle non négociable §3 du plan,
 * `docs/db-schema.md` §7-§8). Toute autre table doit avoir ≥ 1 policy.
 */
const SERVICE_ROLE_ONLY_TABLES = new Set(["stripe_events", "job_queue", "data_connection_secrets"]);

/**
 * Tables produites par le moteur : aucune policy d'écriture (INSERT/UPDATE/
 * DELETE) ne doit exister pour `authenticated` — seul `SELECT` est autorisé
 * côté utilisateur (règle non négociable §3 du plan).
 */
const ENGINE_OUTPUT_TABLES = [
  "plans",
  "plan_versions",
  "plan_blocks",
  "plan_weeks",
  "planned_sessions",
  "nutrition_days",
  "decision_traces",
  "explanations",
  "engine_runs",
  "pain_episodes",
  "stagnation_diagnoses",
  "free_access_events",
  "subscriptions",
];

/** Tables portant un trigger `forbid_mutation()` (immuabilité). */
const IMMUTABLE_TABLES = ["plan_versions", "decision_traces", "consents"];

describe("rls-coverage", () => {
  it("RLS est activée sur 100% des tables du schéma public", async () => {
    const rows = await withPgClient((client) =>
      client
        .query<{ tablename: string; rowsecurity: boolean }>(
          `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
        )
        .then((r) => r.rows),
    );

    expect(rows.length).toBeGreaterThan(0);

    const withoutRls = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(withoutRls, `Tables sans RLS activée : ${withoutRls.join(", ")}`).toEqual([]);
  });

  it("chaque table dispose d'au moins une policy, sauf les tables service_role explicites", async () => {
    const tables = await withPgClient((client) =>
      client
        .query<{ tablename: string }>(
          `select tablename from pg_tables where schemaname = 'public' order by tablename`,
        )
        .then((r) => r.rows.map((row) => row.tablename)),
    );

    const policyCountByTable = await withPgClient((client) =>
      client
        .query<{ tablename: string; count: string }>(
          `select tablename, count(*)::text as count from pg_policies where schemaname = 'public' group by tablename`,
        )
        .then((r) => new Map(r.rows.map((row) => [row.tablename, Number(row.count)]))),
    );

    const missingPolicy = tables.filter((table) => {
      if (SERVICE_ROLE_ONLY_TABLES.has(table)) return false;
      const policyCount = policyCountByTable.get(table) ?? 0;
      return policyCount === 0;
    });

    expect(
      missingPolicy,
      `Tables sans policy explicite (hors service_role) : ${missingPolicy.join(", ")}`,
    ).toEqual([]);

    for (const table of SERVICE_ROLE_ONLY_TABLES) {
      expect(
        policyCountByTable.get(table) ?? 0,
        `${table} devrait être strictement service_role (0 policy attendue)`,
      ).toBe(0);
    }
  });

  it("aucune policy d'écriture n'existe pour `authenticated` sur les tables produites par le moteur", async () => {
    const writePolicies = await withPgClient((client) =>
      client
        .query<{ tablename: string; policyname: string; cmd: string; roles: string[] }>(
          `select tablename, policyname, cmd, roles
           from pg_policies
           where schemaname = 'public'
             and tablename = any($1)
             and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')`,
          [ENGINE_OUTPUT_TABLES],
        )
        .then((r) => r.rows),
    );

    // `plan_diffs` a volontairement un UPDATE réservé à l'acquittement (`acknowledged_at`),
    // ce n'est pas une table de sortie brute du moteur au sens de cette règle et n'est pas
    // listée dans ENGINE_OUTPUT_TABLES — voir docs/db-schema.md §5.
    expect(
      writePolicies,
      `Policies d'écriture inattendues sur des tables produites par le moteur : ${JSON.stringify(writePolicies)}`,
    ).toEqual([]);
  });

  it("les tables immuables portent un trigger forbid_mutation() BEFORE UPDATE OR DELETE", async () => {
    const triggers = await withPgClient((client) =>
      client
        .query<{ table: string; trigger_name: string }>(
          `select c.relname as table, t.tgname as trigger_name
           from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public'
             and c.relname = any($1)
             and p.proname = 'forbid_mutation'
             and not t.tgisinternal`,
          [IMMUTABLE_TABLES],
        )
        .then((r) => r.rows),
    );

    const coveredTables = new Set(triggers.map((t) => t.table));
    const missing = IMMUTABLE_TABLES.filter((table) => !coveredTables.has(table));

    expect(missing, `Tables sans trigger forbid_mutation() : ${missing.join(", ")}`).toEqual([]);
  });
});
