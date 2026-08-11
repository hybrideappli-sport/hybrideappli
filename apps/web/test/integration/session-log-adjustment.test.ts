import { afterAll, describe, expect, it } from "vitest";

import { applyDailyLog } from "@/lib/orchestration/apply-daily-log";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { PAIN_REFERRAL_MESSAGES } from "@/lib/pain-referral-messages";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `session-log-adjustment.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC4/AC9) — la saisie
 * post-séance déclenche un ajustement SYNCHRONE, jamais à la hausse (ADR-005 §5) :
 *
 * - signal négatif (RPE élevé) ⟹ `regeneratePlan('negative_signal')`, `direction: 'decrease'`.
 * - douleur à l'effort ET au repos (AC9, niveau 3 'acute') ⟹ arrêt de la zone, orientation
 *   professionnel de santé (message FIXE, jamais LLM), ET régénération immédiate
 *   (`trigger: 'pain_protocol'`).
 *
 * `applyDailyLog()` est exercé directement (comme `apply-daily-log.ts` le documente, c'est le 2ᵉ
 * orchestrateur d'`08-architecture.md` §3.2) plutôt que via `POST /session-logs` : ce Route Handler
 * dépend de `requireUser()` (`next/headers`), qui n'existe que dans un vrai contexte de requête
 * Next (couvert par `e2e/daily-loop.spec.ts` et `e2e/pain-acute.spec.ts`).
 */
const admin = serviceRoleClient();

async function seedActivePlan(label: string): Promise<{ user: TestUser; objectiveId: string; planVersionId: string }> {
  const user = await createTestUser(label);
  // `applyDailyLog()` insère `session_logs` via le client `rls` de l'utilisateur — `has_active_consent`
  // (`session_logs_insert_own`, `0002_identity_consents.sql`) doit donc réellement être satisfait,
  // pas seulement supposé (contrairement à `seedAthleteAndObjective()`, qui écrit en `service_role`).
  await grantHealthConsents(admin, user.id);
  const { objectiveId } = await seedAthleteAndObjective(admin, user.id);
  const now = "2026-08-10"; // lundi
  const initial = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
  if (initial.outcome !== "plan_generated") {
    throw new Error(`[test] premier plan attendu 'plan_generated', obtenu '${initial.outcome}'`);
  }
  return { user, objectiveId, planVersionId: initial.planVersionId };
}

describe("session-log-adjustment — signal négatif (AC4)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("un RPE élevé déclenche un ajustement immédiat à la baisse, jamais à la hausse", async () => {
    const seeded = await seedActivePlan("session-log-adjustment-negative");
    user = seeded.user;

    const { data: session, error } = await admin
      .from("planned_sessions")
      .select("id, scheduled_date")
      .eq("plan_version_id", seeded.planVersionId)
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .single();
    if (error) throw new Error(`[test] planned_sessions (fixture) : ${error.message}`);

    const response = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now: session.scheduled_date,
      input: {
        plannedSessionId: session.id,
        loggedDate: session.scheduled_date,
        completion: "done",
        actualDurationMin: 45,
        rpe: 9, // >= HIGH_RPE_THRESHOLD (8) — signal négatif, `apply-daily-log.ts`.
        freshness: 3,
        pain: "none",
      },
    });

    expect(response.adjustment.applied).toBe(true);
    expect(response.adjustment.direction).toBe("decrease");
    expect(response.adjustment.planVersionId).not.toBeNull();
    expect(response.adjustment.explanation).not.toBeNull();
    expect(response.painProtocol).toEqual({ level: "none", zoneBlocked: false, referral: null });

    const { data: newVersion, error: versionError } = await admin
      .from("plan_versions")
      .select("id, trigger")
      .eq("id", response.adjustment.planVersionId!)
      .single();
    if (versionError) throw versionError;
    expect(newVersion.trigger).toBe("negative_signal");
    expect(newVersion.id).not.toBe(seeded.planVersionId);

    const { data: activePlan, error: planError } = await admin
      .from("plans")
      .select("current_version_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (planError) throw planError;
    expect(activePlan.current_version_id).toBe(response.adjustment.planVersionId);

    // Le réalisé a bien été persisté malgré l'ajustement synchrone qui en découle.
    const { data: log, error: logError } = await admin.from("session_logs").select("id, rpe").eq("id", response.logId).single();
    if (logError) throw logError;
    expect(log.rpe).toBe(9);
  });
});

describe("session-log-adjustment — protocole douleur niveau 3 'acute' (AC9)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("douleur à l'effort ET au repos bloque la zone, oriente vers un professionnel de santé (message fixe) et régénère le plan", async () => {
    const seeded = await seedActivePlan("session-log-adjustment-pain");
    user = seeded.user;

    const { data: session, error } = await admin
      .from("planned_sessions")
      .select("id, scheduled_date")
      .eq("plan_version_id", seeded.planVersionId)
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .single();
    if (error) throw new Error(`[test] planned_sessions (fixture) : ${error.message}`);

    const response = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now: session.scheduled_date,
      input: {
        plannedSessionId: session.id,
        loggedDate: session.scheduled_date,
        completion: "done",
        actualDurationMin: 30,
        pain: "pain",
        painZone: "knee",
        painAtRest: true, // AC9 niveau 3 — immédiat, pas besoin de persistance (`pain-protocol.ts`).
      },
    });

    expect(response.painProtocol.level).toBe("acute");
    expect(response.painProtocol.zoneBlocked).toBe(true);
    expect(response.painProtocol.referral).toEqual({ required: true, message: PAIN_REFERRAL_MESSAGES.acute });

    expect(response.adjustment.applied).toBe(true);
    expect(response.adjustment.direction).toBe("decrease");

    const { data: newVersion, error: versionError } = await admin
      .from("plan_versions")
      .select("trigger")
      .eq("id", response.adjustment.planVersionId!)
      .single();
    if (versionError) throw versionError;
    expect(newVersion.trigger).toBe("pain_protocol");

    const { data: episode, error: episodeError } = await admin
      .from("pain_episodes")
      .select("zone, level, zone_blocked, referral_issued, resolved_at")
      .eq("user_id", user.id)
      .eq("zone", "knee")
      .is("resolved_at", null)
      .single();
    if (episodeError) throw episodeError;
    expect(episode.level).toBe("acute");
    expect(episode.zone_blocked).toBe(true);
    expect(episode.referral_issued).toBe(true);
  });
});
