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
