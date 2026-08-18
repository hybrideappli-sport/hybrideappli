import { afterAll, describe, expect, it } from "vitest";

import { finalizeSessionLogLoad } from "@/lib/data/finalize-session-log-load";
import { fetchDataOverview } from "@/lib/data/fetch-data-overview";
import { reconcileSessionLogs } from "@/lib/data/reconcile-session-logs";
import { refreshDataRegime } from "@/lib/data/refresh-data-regime";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `reconciliation-excludes-from-aggregates.test.ts` — AC5, ADR-015 §2/§3. « Conséquences / à
 * surveiller » réclame EXPLICITEMENT ce test : « une séance fusionnée ne doit apparaître dans aucun
 * agrégat ». Vérifie le prédicat unique (`session_logs_counted`, `excluded_at is null`) au niveau
 * base, puis un consommateur réel (`fetchDataOverview()`, carte « Mes données » du Dashboard).
 */
const admin = serviceRoleClient();

describe("reconciliation — une séance fusionnée n'apparaît dans aucun agrégat (AC5)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("la ligne perdante disparaît de session_logs_counted et des agrégats dérivés", async () => {
    user = await createTestUser("reconciliation-aggregates");
    await grantHealthConsents(admin, user.id);
    // `enforce_connected_source_consents()` (ADR-013 §5) exige ce consentement dédié pour toute
    // ligne `source = 'connected'` — au-delà de `health_data_processing`.
    const { error: importConsentError } = await admin
      .from("consents")
      .insert({ user_id: user.id, document_code: "third_party_data_import", document_version: "1.0.0", locale: "fr", granted: true });
    if (importConsentError) throw new Error(`[test] consents (third_party_data_import) : ${importConsentError.message}`);
    // `seedAthleteAndObjective()` (pas seulement `seedSportId()`) : `fetchDataOverview()` lit
    // `athlete_profiles.data_regime`, qui n'existe qu'une fois le profil déclaratif créé.
    const { sportId } = await seedAthleteAndObjective(admin, user.id);

    // `session_logs_connected_has_connection` exige un `data_connection_id` dès que `source =
    // 'connected'` — une connexion minimale suffit, aucun jeton réel n'est nécessaire ici.
    const { data: connection, error: connectionError } = await admin
      .from("data_connections")
      .insert({ user_id: user.id, provider_code: "strava", status: "active", external_account_id: "test-athlete-id" })
      .select("id")
      .single();
    if (connectionError) throw new Error(`[test] data_connections (seed) : ${connectionError.message}`);

    const loggedDate = "2026-08-10";
    const declaredStartedAt = `${loggedDate}T09:00:00.000Z`;
    const connectedStartedAt = `${loggedDate}T09:05:00.000Z`; // 5 min d'écart — dans la fenêtre de 90 min (ADR-015 §2).

    // Ligne DÉCLARÉE, insérée en premier — porte un ressenti (RPE) qui doit survivre à la fusion.
    const { data: declaredLog, error: declaredError } = await admin
      .from("session_logs")
      .insert({
        user_id: user.id,
        logged_date: loggedDate,
        sport_id: sportId,
        started_at: declaredStartedAt,
        completion: "done",
        actual_duration_min: 40,
        rpe: 7,
        pain: "none",
        source: "declared",
      })
      .select("id")
      .single();
    if (declaredError) throw new Error(`[test] session_logs (déclarée) : ${declaredError.message}`);
    await finalizeSessionLogLoad(admin, { logId: declaredLog.id, userId: user.id });

    // Ligne CONNECTÉE, insérée ensuite — c'est elle qui doit gagner (ADR-015 §2 : « le mesuré prime »).
    const { data: connectedLog, error: connectedError } = await admin
      .from("session_logs")
      .insert({
        user_id: user.id,
        logged_date: loggedDate,
        sport_id: sportId,
        started_at: connectedStartedAt,
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

    const result = await reconcileSessionLogs(admin, { userId: user.id, logId: connectedLog.id });
    expect(result.merged).toBe(true);
    expect(result.survivingLogId).toBe(connectedLog.id);

    // La ligne perdante porte bien l'exclusion, jamais une suppression (ADR-004 §1, ADR-015 §3).
    const { data: loserRow, error: loserError } = await admin
      .from("session_logs")
      .select("excluded_at, exclusion_reason, superseded_by_log_id")
      .eq("id", declaredLog.id)
      .single();
    if (loserError) throw loserError;
    expect(loserRow.excluded_at).not.toBeNull();
    expect(loserRow.exclusion_reason).toBe("merged_duplicate");
    expect(loserRow.superseded_by_log_id).toBe(connectedLog.id);

    // Le ressenti (RPE) déclaré n'est jamais perdu : transféré sur la ligne portante.
    const { data: winnerRow, error: winnerError } = await admin.from("session_logs").select("rpe").eq("id", connectedLog.id).single();
    if (winnerError) throw winnerError;
    expect(winnerRow.rpe).toBe(7);

    // Prédicat unique de tous les agrégats (ADR-015 §3) : la ligne perdante n'y figure plus.
    const { data: countedRows, error: countedError } = await admin
      .from("session_logs_counted")
      .select("id, load_units")
      .eq("user_id", user.id)
      .eq("logged_date", loggedDate);
    if (countedError) throw countedError;
    expect(countedRows).toHaveLength(1);
    expect(countedRows![0]!.id).toBe(connectedLog.id);

    // Consommateur réel : la carte « Mes données » (AC6) ne somme la charge qu'une seule fois.
    await refreshDataRegime(admin, user.id);
    const overview = await fetchDataOverview(admin, { userId: user.id, now: loggedDate });
    const loadCell = overview.cells.find((c) => c.key === "load")!;
    const { data: winnerLoad } = await admin.from("session_logs").select("load_units").eq("id", connectedLog.id).single();
    expect(loadCell.value).toBe(String(winnerLoad!.load_units));
  });
});
