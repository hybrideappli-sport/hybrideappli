import { afterAll, describe, expect, it } from "vitest";

import { applySessionLogCorrection } from "@/lib/orchestration/apply-session-log-correction";
import { finalizeSessionLogLoad } from "@/lib/data/finalize-session-log-load";
import { reconcileSessionLogs } from "@/lib/data/reconcile-session-logs";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `session-log-correction-replay-enrichment.test.ts` — ADR-015 « Conséquences / à surveiller » :
 * « Un utilisateur qui modifie une saisie déjà fusionnée modifie une ligne EXCLUE. Comportement
 * retenu : l'enrichissement de la ligne portante est REJOUÉ à chaque `PATCH` d'une ligne exclue. À
 * couvrir par un test. » Exerce `applySessionLogCorrection()` (`PATCH /session-logs/:id`, F3) sur
 * la ligne PERDANTE d'une fusion, et vérifie que la ligne portante récupère la correction.
 */
const admin = serviceRoleClient();

describe("PATCH /session-logs/:id — rejeu de l'enrichissement sur une ligne exclue (ADR-015)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("une correction sur la ligne EXCLUE (perdante) est rejouée vers la ligne portante, sans la restaurer", async () => {
    user = await createTestUser("session-log-correction-replay");
    await grantHealthConsents(admin, user.id);
    const { error: importConsentError } = await admin
      .from("consents")
      .insert({ user_id: user.id, document_code: "third_party_data_import", document_version: "1.0.0", locale: "fr", granted: true });
    if (importConsentError) throw new Error(`[test] consents (third_party_data_import) : ${importConsentError.message}`);
    const { objectiveId, sportId } = await seedAthleteAndObjective(admin, user.id);
    // `runSessionLogSignalPipeline()` (partagée par `applyDailyLog()`/`applySessionLogCorrection()`)
    // exige un plan ACTIF, même quand aucun ajustement n'est finalement déclenché.
    const initialPlan = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now: "2026-08-10" });
    if (initialPlan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${initialPlan.outcome}'`);

    const { data: connection, error: connectionError } = await admin
      .from("data_connections")
      .insert({ user_id: user.id, provider_code: "strava", status: "active", external_account_id: "test-athlete-id" })
      .select("id")
      .single();
    if (connectionError) throw new Error(`[test] data_connections (seed) : ${connectionError.message}`);

    const loggedDate = "2026-08-10";

    // Ligne DÉCLARÉE — SANS ressenti au départ (`pain: 'none'`, pas de commentaire) : c'est elle qui
    // va perdre la fusion (la connectée gagne, ADR-015 §2) puis se faire CORRIGER après coup.
    const { data: declaredLog, error: declaredError } = await admin
      .from("session_logs")
      .insert({
        user_id: user.id,
        logged_date: loggedDate,
        sport_id: sportId,
        started_at: `${loggedDate}T09:00:00.000Z`,
        completion: "done",
        actual_duration_min: 40,
        pain: "none",
        source: "declared",
      })
      .select("id")
      .single();
    if (declaredError) throw new Error(`[test] session_logs (déclarée) : ${declaredError.message}`);
    await finalizeSessionLogLoad(admin, { logId: declaredLog.id, userId: user.id });

    const { data: connectedLog, error: connectedError } = await admin
      .from("session_logs")
      .insert({
        user_id: user.id,
        logged_date: loggedDate,
        sport_id: sportId,
        started_at: `${loggedDate}T09:05:00.000Z`,
        completion: "done",
        actual_duration_min: 42,
        pain: "none",
        source: "connected",
        data_connection_id: connection.id,
      })
      .select("id")
      .single();
    if (connectedError) throw new Error(`[test] session_logs (connectée) : ${connectedError.message}`);
    await finalizeSessionLogLoad(admin, { logId: connectedLog.id, userId: user.id });

    const merge = await reconcileSessionLogs(admin, { userId: user.id, logId: connectedLog.id });
    expect(merge.merged).toBe(true);
    expect(merge.survivingLogId).toBe(connectedLog.id);

    // La ligne portante n'a encore aucun ressenti : rien à transférer à la fusion (les deux lignes
    // étaient vierges de RPE/douleur). L'utilisateur corrige ensuite SA ligne — la perdante — pour y
    // ajouter le RPE et une douleur qu'il avait oubliés.
    const correction = await applySessionLogCorrection(user.client, admin, {
      userId: user.id,
      now: loggedDate,
      logId: declaredLog.id,
      input: { rpe: 8, pain: "light", painZone: "knee" },
    });
    expect(correction.logId).toBe(declaredLog.id);
    // Rejeu, pas un nouveau merge : la réconciliation rapportée porte sur la ligne portante déjà connue.
    expect(correction.reconciliation).toEqual({ merged: true, survivingLogId: connectedLog.id });

    // La ligne CORRIGÉE reste exclue — un `PATCH` ne la restaure jamais (seul `unmerge` le fait).
    const { data: correctedRow, error: correctedError } = await admin
      .from("session_logs")
      .select("excluded_at, exclusion_reason, rpe, pain, pain_zone")
      .eq("id", declaredLog.id)
      .single();
    if (correctedError) throw correctedError;
    expect(correctedRow.excluded_at).not.toBeNull();
    expect(correctedRow.exclusion_reason).toBe("merged_duplicate");
    expect(correctedRow.rpe).toBe(8);
    expect(correctedRow.pain).toBe("light");
    expect(correctedRow.pain_zone).toBe("knee");

    // La ligne PORTANTE récupère le ressenti rejoué — c'est elle qui compte dans les agrégats.
    const { data: winnerRow, error: winnerError } = await admin.from("session_logs").select("rpe, pain, pain_zone").eq("id", connectedLog.id).single();
    if (winnerError) throw winnerError;
    expect(winnerRow.rpe).toBe(8);
    expect(winnerRow.pain).toBe("light");
    expect(winnerRow.pain_zone).toBe("knee");

    // Toujours une seule ligne comptée pour cette date (AC5) — la correction n'a pas dédoublé l'agrégat.
    const { data: countedRows, error: countedError } = await admin
      .from("session_logs_counted")
      .select("id")
      .eq("user_id", user.id)
      .eq("logged_date", loggedDate);
    if (countedError) throw countedError;
    expect(countedRows).toHaveLength(1);
    expect(countedRows![0]!.id).toBe(connectedLog.id);
  });

  it("une correction sur une ligne NON exclue ne déclenche aucun rejeu (no-op silencieux)", async () => {
    const standalone = await createTestUser("session-log-correction-no-merge");
    try {
      await grantHealthConsents(admin, standalone.id);
      const { objectiveId, sportId } = await seedAthleteAndObjective(admin, standalone.id);
      const initialPlan = await regeneratePlan(admin, { userId: standalone.id, objectiveId, trigger: "onboarding", now: "2026-08-10" });
      if (initialPlan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${initialPlan.outcome}'`);
      const { data: log, error } = await admin
        .from("session_logs")
        .insert({ user_id: standalone.id, logged_date: "2026-08-10", sport_id: sportId, completion: "done", actual_duration_min: 30, pain: "none" })
        .select("id")
        .single();
      if (error) throw error;
      await finalizeSessionLogLoad(admin, { logId: log.id, userId: standalone.id });

      const correction = await applySessionLogCorrection(standalone.client, admin, {
        userId: standalone.id,
        now: "2026-08-10",
        logId: log.id,
        input: { rpe: 5 },
      });
      expect(correction.reconciliation).toEqual({ merged: false, survivingLogId: log.id });
    } finally {
      await deleteTestUser(standalone.id);
    }
  });
});
