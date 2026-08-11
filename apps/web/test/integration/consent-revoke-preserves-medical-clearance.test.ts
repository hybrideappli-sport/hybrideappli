import { afterAll, describe, expect, it } from "vitest";

import { purgeHealthDataOnConsentRevoke } from "@/lib/orchestration/purge-health-data-on-revoke";
import { fetchActiveMedicalClearanceNotice } from "@/lib/orchestration/read-today-plan";
import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * Interaction B1 × B6 (contre-revue post-correction) — `POST /consents/:code/revoke` (B1) purgeait
 * `risk_flags` sans exception, ce qui faisait disparaître l'avertissement médical fixe (B6, AC3)
 * pour un utilisateur mineur/pathologie déclarée qui retire son consentement santé, alors qu'il
 * garde l'accès à son plan (`plans`/`plan_versions` ne sont volontairement pas purgés).
 *
 * `purgeHealthDataOnConsentRevoke()` est exercé directement plutôt que via le Route Handler HTTP
 * (`next/headers`, hors de portée d'un test d'intégration — voir `session-log-adjustment.test.ts`
 * pour la même justification) : c'est la fonction que la route appelle réellement, extraite pour
 * être testable indépendamment (voir son en-tête).
 */
const admin = serviceRoleClient();

describe("purgeHealthDataOnConsentRevoke — interaction B1 × B6", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("un flag risk_flags 'pathology' actif survit à la purge, l'avertissement médical reste affiché", async () => {
    user = await createTestUser("consent-revoke-b1b6");

    const { error: riskFlagError } = await admin.from("risk_flags").insert({
      user_id: user.id,
      flag_type: "pathology",
      source: "onboarding",
    });
    if (riskFlagError) throw new Error(`[test] risk_flags (fixture) : ${riskFlagError.message}`);

    // Autre séance de saisie santé, purgée normalement (comportement inchangé) — preuve que la
    // correction n'a PAS désactivé la purge dans son ensemble, seulement les flags de sécurité.
    const { error: bodyMetricError } = await admin.from("body_metrics").insert({ user_id: user.id, measured_on: "2026-08-10", weight_kg: 75 });
    if (bodyMetricError) throw new Error(`[test] body_metrics (fixture) : ${bodyMetricError.message}`);

    const noticeBeforeRevoke = await fetchActiveMedicalClearanceNotice(admin, user.id);
    expect(noticeBeforeRevoke).not.toBeNull();

    await purgeHealthDataOnConsentRevoke(admin, user.id);

    const { data: remainingFlags, error: readError } = await admin.from("risk_flags").select("flag_type").eq("user_id", user.id);
    if (readError) throw new Error(`[test] risk_flags (lecture) : ${readError.message}`);
    expect(remainingFlags).toHaveLength(1);
    expect(remainingFlags![0]!.flag_type).toBe("pathology");

    const { count: bodyMetricsCount, error: bodyMetricsCountError } = await admin
      .from("body_metrics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (bodyMetricsCountError) throw new Error(`[test] body_metrics (comptage) : ${bodyMetricsCountError.message}`);
    expect(bodyMetricsCount).toBe(0);

    const noticeAfterRevoke = await fetchActiveMedicalClearanceNotice(admin, user.id);
    expect(noticeAfterRevoke).not.toBeNull();
    expect(noticeAfterRevoke!.message).toBe(noticeBeforeRevoke!.message);
  });

  it("le texte du consentement 'health_data_processing' en vigueur est cohérent avec le comportement de purge (0014_health_data_processing_consent_v1_1_0.sql)", async () => {
    // La version 1.0.0 (0010_seed_referentials.sql) promettait sans réserve « le retrait entraîne
    // la purge de ces données » — devenu inexact pour les flags 'pathology'/'minor' depuis
    // l'interaction B1 × B6 (576bbf2). Ce test vérifie que le document RÉELLEMENT `is_current`
    // (celui que l'utilisateur voit et acquitte, résolu par `POST /api/v1/consents`) documente
    // désormais explicitement l'exception, plutôt que de dupliquer le texte en dur ici (ce qui
    // recréerait le risque de divergence texte/comportement que ce correctif corrige).
    const { data: currentDocument, error } = await admin
      .from("consent_documents")
      .select("version, body_md")
      .eq("code", "health_data_processing")
      .eq("locale", "fr")
      .eq("is_current", true)
      .maybeSingle();
    if (error) throw new Error(`[test] consent_documents (lecture) : ${error.message}`);
    expect(currentDocument, "un document health_data_processing is_current doit exister hors production (ADR-010 §9)").not.toBeNull();

    const body = currentDocument!.body_md;

    // Le retrait purge bien les données de saisie quotidienne (comportement inchangé).
    expect(body).toMatch(/purge/i);

    // L'exception de sécurité (pathologie / mineur conservés) doit être explicite, pas implicite.
    expect(body).toMatch(/pathologie/i);
    expect(body).toMatch(/mineur/i);
    expect(body).toMatch(/professionnel de santé/i);
    expect(body).toMatch(/indépendamment de l'état de ce consentement|indépendamment de ce consentement/i);

    // Le droit à l'effacement complet du compte reste, lui, présenté comme total.
    expect(body).toMatch(/suppression complète|effacement/i);
  });

  it("les flags non liés à la sécurité (ex: 'other') sont purgés normalement", async () => {
    const otherUser = await createTestUser("consent-revoke-b1b6-other");
    try {
      const { error: riskFlagError } = await admin.from("risk_flags").insert({
        user_id: otherUser.id,
        flag_type: "other",
        source: "onboarding",
      });
      if (riskFlagError) throw new Error(`[test] risk_flags (fixture) : ${riskFlagError.message}`);

      await purgeHealthDataOnConsentRevoke(admin, otherUser.id);

      const { count, error: readError } = await admin
        .from("risk_flags")
        .select("id", { count: "exact", head: true })
        .eq("user_id", otherUser.id);
      if (readError) throw new Error(`[test] risk_flags (comptage) : ${readError.message}`);
      expect(count).toBe(0);

      const notice = await fetchActiveMedicalClearanceNotice(admin, otherUser.id);
      expect(notice).toBeNull();
    } finally {
      await deleteTestUser(otherUser.id);
    }
  });
});
