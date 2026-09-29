import { afterAll, describe, expect, it } from "vitest";

import { applyDailyLog } from "@/lib/orchestration/apply-daily-log";
import { applySessionLogCorrection } from "@/lib/orchestration/apply-session-log-correction";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * Bug de production corrigé le 2026-09-29 (amendement ADR-019) — un log porte AU PLUS UNE baisse
 * de 20 %.
 *
 * `runSessionLogSignalPipeline()` décidait sur les seuls signaux FINAUX du log : chaque
 * `PATCH /session-logs/:id` sur un log déjà négatif relançait une régénération `negative_signal`,
 * et la baisse s'appliquait de nouveau sur la version déjà réduite. Le défaut existait depuis la
 * création de la correction (F3) ; le débrief (US-05), qui écrit tôt puis enrichit, le rendait
 * systématique. Constaté à l'écran : cible 189 → 151 (douleur), puis 151 → 121 (effort 7/10, qui
 * n'est pas un signal négatif).
 */
const admin = serviceRoleClient();

async function seed(label: string) {
  const user = await createTestUser(label);
  await grantHealthConsents(admin, user.id);
  const { objectiveId } = await seedAthleteAndObjective(admin, user.id);
  const initial = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now: "2026-08-10" });
  if (initial.outcome !== "plan_generated") throw new Error(`[test] plan attendu, obtenu '${initial.outcome}'`);
  const { data: session, error } = await admin
    .from("planned_sessions")
    .select("id, scheduled_date")
    .eq("plan_version_id", initial.planVersionId)
    .neq("session_type", "rest")
    .order("scheduled_date", { ascending: true })
    .limit(1)
    .single();
  if (error) throw new Error(`[test] planned_sessions : ${error.message}`);
  return { user, plannedSessionId: session.id, now: session.scheduled_date };
}

/** Nombre de baisses `negative_signal` / `pain_protocol` appliquées au plan de l'utilisateur. */
async function reductionCount(userId: string): Promise<number> {
  const { count, error } = await admin
    .from("decision_traces")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("rule_id", "progression.negative_signal_reduction");
  if (error) throw error;
  return count ?? 0;
}

describe("un log porte au plus une baisse de charge (bug de production, 2026-09-29)", () => {
  const users: TestUser[] = [];
  afterAll(async () => {
    for (const user of users) await deleteTestUser(user.id);
  });

  it("rejoue la capture 8 : douleur au genou, puis effort 7/10 et forme 3/5 — une seule baisse", async () => {
    const { user, plannedSessionId, now } = await seed("reduction-capture-8");
    users.push(user);

    // Mêmes signaux, même ordre que la capture : le trio d'abord, l'effort ensuite, par correction.
    const created = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now,
      input: { plannedSessionId, loggedDate: now, completion: "done", pain: "pain", painZone: "knee" },
    });
    expect(created.adjustment.applied).toBe(true);
    expect(await reductionCount(user.id)).toBe(1);

    const effort = await applySessionLogCorrection(user.client, admin, {
      userId: user.id,
      now,
      logId: created.logId,
      input: { rpe: 7, freshness: 3 },
    });
    // Avant correction : une seconde version `negative_signal`, 151 → 121.
    expect(effort.adjustment.applied).toBe(false);
    expect(await reductionCount(user.id)).toBe(1);
  });

  it("chemin PATCH seul (formulaire de correction) : corriger un log déjà négatif ne réduit pas de nouveau", async () => {
    const { user, plannedSessionId, now } = await seed("reduction-patch");
    users.push(user);

    const created = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now,
      input: { plannedSessionId, loggedDate: now, completion: "done", pain: "light", painZone: "calf", rpe: 6 },
    });
    expect(created.adjustment.applied).toBe(true);

    const corrected = await applySessionLogCorrection(user.client, admin, {
      userId: user.id,
      now,
      logId: created.logId,
      input: { rpe: 9, comment: "En fait c'était dur" },
    });
    expect(corrected.adjustment.applied).toBe(false);
    expect(await reductionCount(user.id)).toBe(1);
  });

  it("un PATCH qui rend négatif un log qui ne l'était pas déclenche toujours la baisse", async () => {
    const { user, plannedSessionId, now } = await seed("reduction-nouveau-signal");
    users.push(user);

    const created = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now,
      input: { plannedSessionId, loggedDate: now, completion: "done", pain: "none", rpe: 5 },
    });
    expect(created.adjustment.applied).toBe(false);

    const corrected = await applySessionLogCorrection(user.client, admin, { userId: user.id, now, logId: created.logId, input: { freshness: 1 } });
    expect(corrected.adjustment.applied).toBe(true);
    expect(await reductionCount(user.id)).toBe(1);
  });

  it("une escalade du protocole douleur par PATCH reste un événement nouveau : zone bloquée et renvoi", async () => {
    const { user, plannedSessionId, now } = await seed("reduction-escalade");
    users.push(user);

    const created = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now,
      input: { plannedSessionId, loggedDate: now, completion: "done", pain: "pain", painZone: "knee" },
    });
    expect(created.painProtocol.zoneBlocked).toBe(false);

    const escalated = await applySessionLogCorrection(user.client, admin, {
      userId: user.id,
      now,
      logId: created.logId,
      input: { pain: "pain", painZone: "knee", painAtRest: true },
    });
    expect(escalated.painProtocol.level).toBe("acute");
    expect(escalated.painProtocol.zoneBlocked).toBe(true);
    expect(escalated.painProtocol.referral?.required).toBe(true);
    expect(escalated.adjustment.applied).toBe(true);
  });
});
