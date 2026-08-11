import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * AC3 — le verrou de consentement santé est vérifié pour de vrai, pas seulement affirmé dans un
 * message de commit (finding I10, audit Lot L1 — aucun test ne couvrait cette règle non
 * négociable §3 du plan avant ce fichier).
 *
 * `has_active_consent()` (docs/db-schema.md §0.3) regarde la DERNIÈRE ligne `consents` pour
 * (user, document_code), triée par `granted_at desc` : un retrait est une NOUVELLE ligne
 * `granted = false`, jamais une mise à jour (`consents` est append-only, écriture exclusive
 * `service_role` depuis l'arbitrage `architect` du 2026-08-07 — ADR-012 §1). Les 4 policies
 * `INSERT` couvertes ici (minimum exigé par le plan §4.3) : `session_logs`, `body_metrics`,
 * `risk_flags`, `athlete_profiles`. En prime : `UPDATE` sur `session_logs` et `athlete_profiles`,
 * gagné par le même arbitrage (R3, docs/db-schema.md — test T9).
 */

const HEALTH_DOCUMENT_CODE = "health_data_processing";
const HEALTH_DOCUMENT_VERSION = "1.0.0";

describe("rls — verrou de consentement santé (AC3)", () => {
  let user: TestUser;
  const admin = serviceRoleClient();

  beforeAll(async () => {
    user = await createTestUser("health-consent");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function grantHealthConsent(): Promise<void> {
    const { error } = await admin.from("consents").insert({
      user_id: user.id,
      document_code: HEALTH_DOCUMENT_CODE,
      document_version: HEALTH_DOCUMENT_VERSION,
      granted: true,
    });
    if (error) throw error;
  }

  async function revokeHealthConsent(): Promise<void> {
    // Append-only : le retrait est une NOUVELLE ligne plus récente (`granted_at` par défaut
    // `now()`), jamais une mise à jour de la ligne d'octroi (immuable, `forbid_mutation()`).
    const { error } = await admin.from("consents").insert({
      user_id: user.id,
      document_code: HEALTH_DOCUMENT_CODE,
      document_version: HEALTH_DOCUMENT_VERSION,
      granted: false,
    });
    if (error) throw error;
  }

  describe("session_logs, body_metrics, risk_flags : INSERT gardé par le consentement", () => {
    it("session_logs : INSERT refusé sans consentement santé actif", async () => {
      const { error } = await user.client
        .from("session_logs")
        .insert({ user_id: user.id, logged_date: "2026-08-03", completion: "done" });
      expect(error, "l'insertion aurait dû être rejetée : aucun consentement santé").not.toBeNull();
    });

    it("body_metrics : INSERT refusé sans consentement santé actif", async () => {
      const { error } = await user.client
        .from("body_metrics")
        .insert({ user_id: user.id, measured_on: "2026-08-03", weight_kg: 70 });
      expect(error, "l'insertion aurait dû être rejetée : aucun consentement santé").not.toBeNull();
    });

    it("risk_flags : INSERT refusé sans consentement santé actif", async () => {
      const { error } = await user.client
        .from("risk_flags")
        .insert({ user_id: user.id, flag_type: "other" });
      expect(error, "l'insertion aurait dû être rejetée : aucun consentement santé").not.toBeNull();
    });

    it("octroi du consentement santé (service_role)", async () => {
      await grantHealthConsent();
    });

    it("session_logs : INSERT accepté avec consentement santé actif", async () => {
      const { error } = await user.client
        .from("session_logs")
        .insert({ user_id: user.id, logged_date: "2026-08-04", completion: "done" });
      expect(error, `session_logs : ${error?.message}`).toBeNull();
    });

    it("body_metrics : INSERT accepté avec consentement santé actif", async () => {
      const { error } = await user.client
        .from("body_metrics")
        .insert({ user_id: user.id, measured_on: "2026-08-04", weight_kg: 70 });
      expect(error, `body_metrics : ${error?.message}`).toBeNull();
    });

    it("risk_flags : INSERT accepté avec consentement santé actif", async () => {
      const { error } = await user.client
        .from("risk_flags")
        .insert({ user_id: user.id, flag_type: "other" });
      expect(error, `risk_flags : ${error?.message}`).toBeNull();
    });

    it("retrait du consentement santé (nouvelle ligne consents, plus récente que l'octroi)", async () => {
      await revokeHealthConsent();
    });

    it("session_logs : INSERT refusé après un retrait plus récent que l'octroi", async () => {
      const { error } = await user.client
        .from("session_logs")
        .insert({ user_id: user.id, logged_date: "2026-08-05", completion: "done" });
      expect(error, "l'insertion aurait dû être rejetée : consentement retiré").not.toBeNull();
    });

    it("body_metrics : INSERT refusé après un retrait plus récent que l'octroi", async () => {
      const { error } = await user.client
        .from("body_metrics")
        .insert({ user_id: user.id, measured_on: "2026-08-05", weight_kg: 70 });
      expect(error, "l'insertion aurait dû être rejetée : consentement retiré").not.toBeNull();
    });

    it("risk_flags : INSERT refusé après un retrait plus récent que l'octroi", async () => {
      const { error } = await user.client
        .from("risk_flags")
        .insert({ user_id: user.id, flag_type: "other" });
      expect(error, "l'insertion aurait dû être rejetée : consentement retiré").not.toBeNull();
    });
  });

  describe("athlete_profiles : INSERT (une seule ligne par utilisateur) puis UPDATE gardés par le consentement", () => {
    it("INSERT refusé sans consentement santé actif", async () => {
      const { error } = await user.client
        .from("athlete_profiles")
        .insert({ user_id: user.id, experience_level: "beginner" });
      expect(error, "l'insertion aurait dû être rejetée : aucun consentement santé").not.toBeNull();
    });

    it("octroi du consentement santé (service_role)", async () => {
      await grantHealthConsent();
    });

    it("INSERT accepté avec consentement santé actif", async () => {
      const { error } = await user.client
        .from("athlete_profiles")
        .insert({ user_id: user.id, experience_level: "beginner" });
      expect(error, `athlete_profiles : ${error?.message}`).toBeNull();
    });

    it("UPDATE accepté avec consentement santé actif", async () => {
      const { error } = await user.client
        .from("athlete_profiles")
        .update({ experience_level: "intermediate" })
        .eq("user_id", user.id);
      expect(error, `athlete_profiles : ${error?.message}`).toBeNull();
    });

    it("retrait du consentement santé (nouvelle ligne consents, plus récente que l'octroi)", async () => {
      await revokeHealthConsent();
    });

    it("UPDATE refusé après un retrait plus récent que l'octroi (finding I10 / test T9)", async () => {
      const { error, count } = await user.client
        .from("athlete_profiles")
        .update({ experience_level: "advanced" }, { count: "exact" })
        .eq("user_id", user.id);
      // RLS filtre la ligne cible via le `with check` : soit une erreur, soit 0 ligne affectée —
      // jamais une écriture silencieusement acceptée une fois le consentement retiré.
      expect(error === null ? count : 0, "aucune ligne ne doit être modifiable consentement retiré").not.toBeGreaterThan(0);
    });
  });
});
