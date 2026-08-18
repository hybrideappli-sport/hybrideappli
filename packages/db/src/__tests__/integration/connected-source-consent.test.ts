import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `docs/db-schema.md` §« Tests attendus » T20-T21, ADR-013 §5 — `enforce_connected_source_consents()`
 * (`0019_actuals_data_sources.sql`) est un TRIGGER, pas une policy RLS : il protège l'import
 * `source = 'connected'` même contre `service_role`, qui contourne RLS mais pas les triggers. Les
 * deux consentements (`health_data_processing`, `third_party_data_import`) sont CUMULATIFS —
 * l'absence de l'un OU l'autre bloque l'import. Fichier manquant relevé par le second audit
 * `code-reviewer` (finding B6, revue post-`aaba499`), portant aussi sur l'écart délibéré documenté
 * en tête de `0019_actuals_data_sources.sql` (réimplémentation de la requête de
 * `has_active_consent()` plutôt qu'un appel direct — vérifié ici comportementalement identique :
 * même issue « refusé sans consentement », que la vérification passe par l'une ou l'autre requête).
 */

const HEALTH_CODE = "health_data_processing";
const HEALTH_VERSION = "1.0.0";
const IMPORT_CODE = "third_party_data_import";
const IMPORT_VERSION = "1.0.0";

describe("enforce_connected_source_consents — T20/T21 (ADR-013 §5, y compris service_role)", () => {
  let user: TestUser;
  const admin = serviceRoleClient();
  let connectionId: string;

  beforeAll(async () => {
    user = await createTestUser("connected-consent");

    const { data: connection, error: connectionError } = await admin
      .from("data_connections")
      .insert({ user_id: user.id, provider_code: "strava", status: "active" })
      .select("id")
      .single();
    if (connectionError || !connection) throw connectionError ?? new Error("data_connections: insertion fixture impossible");
    connectionId = connection.id;
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  async function grantConsent(documentCode: string, documentVersion: string): Promise<void> {
    const { error } = await admin.from("consents").insert({ user_id: user.id, document_code: documentCode, document_version: documentVersion, granted: true });
    if (error) throw error;
  }

  function insertConnectedLog(externalActivityId: string) {
    // `service_role` : contourne RLS (aucune policy INSERT n'existe même pour ce rôle sur les
    // colonnes serveur), pour isoler exactement le comportement du TRIGGER — pas celui d'une
    // policy ou d'un GRANT colonne (déjà couverts par T17/T18).
    return admin.from("session_logs").insert({
      user_id: user.id,
      logged_date: "2026-08-03",
      completion: "done",
      source: "connected",
      data_connection_id: connectionId,
      external_activity_id: externalActivityId,
    });
  }

  it("T20 — aucun consentement : import refusé, y compris en service_role", async () => {
    const { error } = await insertConnectedLog(`t20-${randomUUID()}`);
    expect(error, "l'import aurait dû être rejeté sans aucun consentement").not.toBeNull();
    expect(error?.message ?? "").toMatch(/consentement/i);
  });

  it("T20 — consentement santé seul (sans third_party_data_import) : import refusé", async () => {
    await grantConsent(HEALTH_CODE, HEALTH_VERSION);
    const { error } = await insertConnectedLog(`t20b-${randomUUID()}`);
    expect(error, "l'import aurait dû être rejeté sans le consentement d'import tiers").not.toBeNull();
    expect(error?.message ?? "").toMatch(/tierce/i);
  });

  it("T21 — consentement d'import tiers seul (santé retiré) : import refusé — les deux sont cumulatifs", async () => {
    // Retrait du consentement santé (append-only : nouvelle ligne plus récente, `granted: false`).
    const { error: revokeError } = await admin.from("consents").insert({ user_id: user.id, document_code: HEALTH_CODE, document_version: HEALTH_VERSION, granted: false });
    if (revokeError) throw revokeError;
    await grantConsent(IMPORT_CODE, IMPORT_VERSION);

    const { error } = await insertConnectedLog(`t21-${randomUUID()}`);
    expect(error, "l'import aurait dû être rejeté sans le consentement santé actif").not.toBeNull();
    expect(error?.message ?? "").toMatch(/donnée.*santé|santé.*donnée/i);
  });

  it("les deux consentements actifs simultanément : import accepté (contrôle positif)", async () => {
    await grantConsent(HEALTH_CODE, HEALTH_VERSION);
    // `third_party_data_import` déjà accordé au test précédent (append-only, toujours la ligne la
    // plus récente).
    const { error } = await insertConnectedLog(`t20c-${randomUUID()}`);
    expect(error, `l'import aurait dû être accepté avec les deux consentements actifs : ${error?.message}`).toBeNull();
  });

  it("même trigger sur body_metrics : import refusé sans les deux consentements", async () => {
    // Nouvel utilisateur : aucun consentement accordé, table sans dépendance à `data_connections`.
    const isolatedUser = await createTestUser("connected-consent-bm");
    try {
      const { error } = await admin.from("body_metrics").insert({ user_id: isolatedUser.id, measured_on: "2026-08-03", source: "connected" });
      expect(error, "l'import aurait dû être rejeté sans aucun consentement").not.toBeNull();
      expect(error?.message ?? "").toMatch(/consentement/i);
    } finally {
      await deleteTestUser(isolatedUser.id);
    }
  });
});
