import { afterAll, describe, expect, it } from "vitest";

import { finalizeSessionLogLoad } from "@/lib/data/finalize-session-log-load";
import { reconcileSessionLogs } from "@/lib/data/reconcile-session-logs";
import { SessionLogNotFoundError, SessionLogNotMergedError, unmergeSessionLog } from "@/lib/data/unmerge-session-log";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `session-log-unmerge.test.ts` — AC5, ADR-015 §2 (« la fusion est réversible »). Cible
 * `unmergeSessionLog()` (extrait de `POST /session-logs/:id/unmerge`, ce Route Handler dépendant de
 * `requireUser()`/`next/headers`, hors de portée d'un test d'intégration Node — même patron que
 * `applyDailyLog()`).
 */
const admin = serviceRoleClient();

describe("unmerge — la séance absorbée réapparaît après séparation (AC5)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("restaure la ligne perdante (excluded_at, exclusion_reason, superseded_by_log_id) sans toucher la ligne portante", async () => {
    user = await createTestUser("session-log-unmerge");
    await grantHealthConsents(admin, user.id);
    const { error: importConsentError } = await admin
      .from("consents")
      .insert({ user_id: user.id, document_code: "third_party_data_import", document_version: "1.0.0", locale: "fr", granted: true });
    if (importConsentError) throw new Error(`[test] consents (third_party_data_import) : ${importConsentError.message}`);
    const { sportId } = await seedAthleteAndObjective(admin, user.id);

    const { data: connection, error: connectionError } = await admin
      .from("data_connections")
      .insert({ user_id: user.id, provider_code: "strava", status: "active", external_account_id: "test-athlete-id" })
      .select("id")
      .single();
    if (connectionError) throw new Error(`[test] data_connections (seed) : ${connectionError.message}`);

    const loggedDate = "2026-08-10";

    const { data: declaredLog, error: declaredError } = await admin
      .from("session_logs")
      .insert({
        user_id: user.id,
        logged_date: loggedDate,
        sport_id: sportId,
        started_at: `${loggedDate}T09:00:00.000Z`,
        completion: "done",
        actual_duration_min: 40,
        rpe: 6,
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

    const result = await unmergeSessionLog(admin, { userId: user.id, logId: declaredLog.id, now: loggedDate });
    expect(result).toEqual({ logId: declaredLog.id, restored: true });

    const { data: restoredRow, error: restoredError } = await admin
      .from("session_logs")
      .select("excluded_at, exclusion_reason, superseded_by_log_id, rpe")
      .eq("id", declaredLog.id)
      .single();
    if (restoredError) throw restoredError;
    expect(restoredRow.excluded_at).toBeNull();
    expect(restoredRow.exclusion_reason).toBeNull();
    expect(restoredRow.superseded_by_log_id).toBeNull();
    expect(restoredRow.rpe).toBe(6); // sa propre saisie, inchangée.

    // La ligne portante GARDE l'enrichissement déjà transféré (ADR-015 §2 : jamais annulé par un `unmerge`).
    const { data: winnerRow, error: winnerError } = await admin.from("session_logs").select("rpe, excluded_at").eq("id", connectedLog.id).single();
    if (winnerError) throw winnerError;
    expect(winnerRow.rpe).toBe(6);
    expect(winnerRow.excluded_at).toBeNull();

    // Les deux lignes réapparaissent dans l'agrégat, séparément.
    const { data: countedRows, error: countedError } = await admin
      .from("session_logs_counted")
      .select("id")
      .eq("user_id", user.id)
      .eq("logged_date", loggedDate);
    if (countedError) throw countedError;
    expect(new Set(countedRows!.map((r) => r.id))).toEqual(new Set([declaredLog.id, connectedLog.id]));
  });

  it("refuse d'annuler une séance qui n'est pas le résultat d'une fusion (409)", async () => {
    const standaloneUser = await createTestUser("session-log-unmerge-standalone");
    try {
      await grantHealthConsents(admin, standaloneUser.id);
      const { sportId } = await seedAthleteAndObjective(admin, standaloneUser.id);
      const { data: log, error } = await admin
        .from("session_logs")
        .insert({ user_id: standaloneUser.id, logged_date: "2026-08-10", sport_id: sportId, completion: "done", actual_duration_min: 30, pain: "none" })
        .select("id")
        .single();
      if (error) throw error;

      await expect(unmergeSessionLog(admin, { userId: standaloneUser.id, logId: log.id, now: "2026-08-10" })).rejects.toThrow(SessionLogNotMergedError);
    } finally {
      await deleteTestUser(standaloneUser.id);
    }
  });

  it("renvoie 'introuvable' pour une séance qui n'appartient pas à l'utilisateur", async () => {
    const owner = await createTestUser("session-log-unmerge-owner");
    const stranger = await createTestUser("session-log-unmerge-stranger");
    try {
      await grantHealthConsents(admin, owner.id);
      const { sportId } = await seedAthleteAndObjective(admin, owner.id);
      const { data: log, error } = await admin
        .from("session_logs")
        .insert({ user_id: owner.id, logged_date: "2026-08-10", sport_id: sportId, completion: "done", actual_duration_min: 30, pain: "none" })
        .select("id")
        .single();
      if (error) throw error;

      await expect(unmergeSessionLog(admin, { userId: stranger.id, logId: log.id, now: "2026-08-10" })).rejects.toThrow(SessionLogNotFoundError);
    } finally {
      await deleteTestUser(owner.id);
      await deleteTestUser(stranger.id);
    }
  });
});
