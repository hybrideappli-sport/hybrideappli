import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closeOutScheduleIncidents } from "@/lib/planning/close-out-schedule-incidents";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { addDaysIso } from "@/lib/dates";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `schedule-closeout-outcomes.test.ts` — ADR-017 §3 : les QUATRE issues du job `schedule_closeout`,
 * chacune sur un scénario réel, journalisées dans `schedule_incidents.closeout_outcome`.
 *
 * Les incidents sont fabriqués DIRECTEMENT (`service_role`) plutôt que via `resolveScheduleIncident()`
 * (résolution complète de placement, hors périmètre de ce test) : `closeOutScheduleIncidents()` ne
 * lit que `schedule_incidents` + l'état courant du plan/des logs, jamais le CHEMIN qui a produit
 * l'incident — les fixtures directes exercent donc exactement la même logique.
 */
const admin = serviceRoleClient();

const DUMMY_WINDOW = { blocked_slot: "am" as const, blocked_from: "08:00:00", blocked_to: "09:00:00" };

async function insertOpenIncident(args: { userId: string; plannedSessionId: string | null; reportedForDate: string; resolution: "rescheduled" | "cancelled_week" }) {
  const { data, error } = await admin
    .from("schedule_incidents")
    .insert({
      id: randomUUID(),
      user_id: args.userId,
      reported_for_date: args.reportedForDate,
      planned_session_id: args.plannedSessionId,
      resolution: args.resolution,
      ...DUMMY_WINDOW,
    })
    .select("id")
    .single();
  if (error) throw new Error(`[test] schedule_incidents (fixture) : ${error.message}`);
  return data.id as string;
}

/**
 * Séance planifiée ORPHELINE : rattachée à une version de plan qui n'est PAS la version active, et
 * pour laquelle aucun placement n'a jamais été calculé (`session_placements` reste vide). Reproduit
 * `skipped_session_absent` sans dépendre d'une régénération réelle (ADR-017 §3, dernière ligne du
 * tableau des issues : « aucun placement courant, ET la séance d'origine n'appartient plus à la
 * version active »).
 */
async function fabricateOrphanedPlannedSession(args: { userId: string; planId: string; scheduledDate: string }): Promise<string> {
  const { userId, planId, scheduledDate } = args;
  const ruleset = await getActiveRuleset(admin);

  const { data: engineRun, error: engineRunError } = await admin
    .from("engine_runs")
    .insert({ user_id: userId, trigger: "onboarding", ruleset_version: ruleset.version, input_snapshot_hash: `test-orphan:${randomUUID()}`, status: "succeeded", finished_at: new Date().toISOString() })
    .select("id")
    .single();
  if (engineRunError) throw new Error(`[test] engine_runs (orpheline) : ${engineRunError.message}`);

  const { data: planVersion, error: planVersionError } = await admin
    .from("plan_versions")
    .insert({
      plan_id: planId,
      user_id: userId,
      version_number: 9999,
      trigger: "onboarding",
      ruleset_version: ruleset.version,
      engine_run_id: engineRun.id,
      input_snapshot: {},
      input_snapshot_hash: `test-orphan:${randomUUID()}`,
      snapshot: {},
      horizon_start: scheduledDate,
      horizon_end: addDaysIso(scheduledDate, 13),
    })
    .select("id")
    .single();
  if (planVersionError) throw new Error(`[test] plan_versions (orpheline) : ${planVersionError.message}`);

  const { data: planWeek, error: planWeekError } = await admin
    .from("plan_weeks")
    .insert({ plan_version_id: planVersion.id, user_id: userId, week_start: scheduledDate, iso_week: "2099-W01", detail_level: "detailed", target_load_units: 0 })
    .select("id")
    .single();
  if (planWeekError) throw new Error(`[test] plan_weeks (orpheline) : ${planWeekError.message}`);

  const { data: session, error: sessionError } = await admin
    .from("planned_sessions")
    .insert({
      plan_version_id: planVersion.id,
      plan_week_id: planWeek.id,
      user_id: userId,
      scheduled_date: scheduledDate,
      session_type: "endurance",
      detail_level: "detailed",
      load_units: 0,
    })
    .select("id")
    .single();
  if (sessionError) throw new Error(`[test] planned_sessions (orpheline) : ${sessionError.message}`);

  // Jamais placée : aucun appel à `materializeSessionPlacements()` pour cette version — c'est
  // précisément ce qui doit manquer pour atteindre `skipped_session_absent`.
  return session.id as string;
}

describe("closeOutScheduleIncidents — quatre issues journalisées (ADR-017 §3)", () => {
  let userWithConsent: TestUser;
  let userNoConsent: TestUser;

  afterAll(async () => {
    if (userWithConsent) await deleteTestUser(userWithConsent.id);
    if (userNoConsent) await deleteTestUser(userNoConsent.id);
  });

  it("already_logged / log_created / skipped_session_absent — sur le même utilisateur", async () => {
    userWithConsent = await createTestUser("schedule-closeout-consent");
    await grantHealthConsents(admin, userWithConsent.id);
    const { objectiveId } = await seedAthleteAndObjective(admin, userWithConsent.id);

    const now = "2026-08-10"; // lundi
    const plan = await regeneratePlan(admin, { userId: userWithConsent.id, objectiveId, trigger: "onboarding", now });
    if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

    const { data: activePlanRow, error: activePlanRowError } = await admin.from("plans").select("id").eq("user_id", userWithConsent.id).eq("status", "active").single();
    if (activePlanRowError) throw activePlanRowError;

    const { data: sessions, error: sessionsError } = await admin
      .from("planned_sessions")
      .select("id, scheduled_date")
      .eq("plan_version_id", plan.planVersionId)
      .order("scheduled_date", { ascending: true });
    if (sessionsError) throw sessionsError;
    expect(sessions!.length).toBeGreaterThanOrEqual(2);

    const sessionForAlreadyLogged = sessions![0]!;
    const sessionForLogCreated = sessions![1]!;
    expect(sessionForAlreadyLogged.scheduled_date).not.toBe(sessionForLogCreated.scheduled_date);

    // `already_logged` — une saisie existe déjà à cette date (peu importe sa provenance).
    const { error: preexistingLogError } = await admin
      .from("session_logs")
      .insert({ user_id: userWithConsent.id, logged_date: sessionForAlreadyLogged.scheduled_date, completion: "done", actual_duration_min: 35, pain: "none" });
    if (preexistingLogError) throw new Error(`[test] session_logs (already_logged, fixture) : ${preexistingLogError.message}`);

    // `skipped_session_absent` — séance orpheline, une date qu'aucune autre fixture n'utilise.
    const absentDate = addDaysIso(now, 60);
    const orphanedSessionId = await fabricateOrphanedPlannedSession({ userId: userWithConsent.id, planId: activePlanRow.id, scheduledDate: absentDate });

    const alreadyLoggedIncidentId = await insertOpenIncident({
      userId: userWithConsent.id,
      plannedSessionId: sessionForAlreadyLogged.id,
      reportedForDate: sessionForAlreadyLogged.scheduled_date,
      resolution: "cancelled_week",
    });
    const logCreatedIncidentId = await insertOpenIncident({
      userId: userWithConsent.id,
      plannedSessionId: sessionForLogCreated.id,
      reportedForDate: sessionForLogCreated.scheduled_date,
      resolution: "rescheduled",
    });
    const sessionAbsentIncidentId = await insertOpenIncident({
      userId: userWithConsent.id,
      plannedSessionId: orphanedSessionId,
      reportedForDate: absentDate,
      resolution: "cancelled_week",
    });

    const localDate = addDaysIso(now, 90); // largement après toutes les `reported_for_date` en jeu.
    const results = await closeOutScheduleIncidents(admin, { userId: userWithConsent.id, localDate });
    const byId = new Map(results.map((r) => [r.incidentId, r.outcome]));

    expect(byId.get(alreadyLoggedIncidentId)).toBe("already_logged");
    expect(byId.get(logCreatedIncidentId)).toBe("log_created");
    expect(byId.get(sessionAbsentIncidentId)).toBe("skipped_session_absent");

    // `already_logged` — aucune écriture nouvelle, `closed_out_at` renseigné quand même.
    const { data: alreadyLoggedRow, error: alreadyLoggedRowError } = await admin
      .from("schedule_incidents")
      .select("closeout_outcome, closed_out_at, resulting_session_log_id")
      .eq("id", alreadyLoggedIncidentId)
      .single();
    if (alreadyLoggedRowError) throw alreadyLoggedRowError;
    expect(alreadyLoggedRow.closeout_outcome).toBe("already_logged");
    expect(alreadyLoggedRow.closed_out_at).not.toBeNull();
    expect(alreadyLoggedRow.resulting_session_log_id).toBeNull();

    // `log_created` — un `session_log` `not_done`/`load_units = 0` est écrit et lié (ADR-017 §4, §8).
    const { data: logCreatedRow, error: logCreatedRowError } = await admin
      .from("schedule_incidents")
      .select("closeout_outcome, closed_out_at, resulting_session_log_id")
      .eq("id", logCreatedIncidentId)
      .single();
    if (logCreatedRowError) throw logCreatedRowError;
    expect(logCreatedRow.closeout_outcome).toBe("log_created");
    expect(logCreatedRow.resulting_session_log_id).not.toBeNull();

    const { data: createdLog, error: createdLogError } = await admin
      .from("session_logs")
      .select("completion, load_units, logged_date, not_done_reason, source")
      .eq("id", logCreatedRow.resulting_session_log_id!)
      .single();
    if (createdLogError) throw createdLogError;
    expect(createdLog.completion).toBe("not_done");
    expect(createdLog.load_units).toBe(0);
    expect(createdLog.logged_date).toBe(sessionForLogCreated.scheduled_date);
    expect(createdLog.source).toBe("declared");
    expect(createdLog.not_done_reason).toContain("déplacée");

    // `skipped_session_absent` — aucune écriture, le moteur a reprojeté la semaine (ADR-017 §3).
    const { data: absentRow, error: absentRowError } = await admin
      .from("schedule_incidents")
      .select("closeout_outcome, closed_out_at, resulting_session_log_id")
      .eq("id", sessionAbsentIncidentId)
      .single();
    if (absentRowError) throw absentRowError;
    expect(absentRow.closeout_outcome).toBe("skipped_session_absent");
    expect(absentRow.resulting_session_log_id).toBeNull();

    // Idempotence de la clôture (ADR-017 §3, dernier paragraphe) : un second passage ne referme rien.
    const secondPass = await closeOutScheduleIncidents(admin, { userId: userWithConsent.id, localDate });
    expect(secondPass).toHaveLength(0);
  });

  it("skipped_no_consent — consentement santé retiré ou jamais accordé", async () => {
    userNoConsent = await createTestUser("schedule-closeout-no-consent");
    // Volontairement AUCUN `grantHealthConsents()` — reproduit un consentement jamais accordé/retiré.
    const { objectiveId } = await seedAthleteAndObjective(admin, userNoConsent.id);

    const now = "2026-08-10";
    const plan = await regeneratePlan(admin, { userId: userNoConsent.id, objectiveId, trigger: "onboarding", now });
    if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

    const { data: sessions, error: sessionsError } = await admin
      .from("planned_sessions")
      .select("id, scheduled_date")
      .eq("plan_version_id", plan.planVersionId)
      .order("scheduled_date", { ascending: true })
      .limit(1);
    if (sessionsError) throw sessionsError;
    const targetSession = sessions![0]!;

    const incidentId = await insertOpenIncident({
      userId: userNoConsent.id,
      plannedSessionId: targetSession.id,
      reportedForDate: targetSession.scheduled_date,
      resolution: "cancelled_week",
    });

    const localDate = addDaysIso(now, 30);
    const results = await closeOutScheduleIncidents(admin, { userId: userNoConsent.id, localDate });
    expect(results).toEqual([{ incidentId, outcome: "skipped_no_consent" }]);

    const { data: row, error: rowError } = await admin
      .from("schedule_incidents")
      .select("closeout_outcome, closed_out_at, resulting_session_log_id")
      .eq("id", incidentId)
      .single();
    if (rowError) throw rowError;
    expect(row.closeout_outcome).toBe("skipped_no_consent");
    expect(row.closed_out_at).not.toBeNull();
    expect(row.resulting_session_log_id).toBeNull();

    const { count } = await admin.from("session_logs").select("id", { count: "exact", head: true }).eq("user_id", userNoConsent.id);
    expect(count ?? 0).toBe(0);
  });
});
