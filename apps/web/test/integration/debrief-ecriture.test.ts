import { afterAll, describe, expect, it } from "vitest";

import { CreateSessionLogInputSchema } from "@hybride/domain";

import { applyDailyLog } from "@/lib/orchestration/apply-daily-log";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { runDebriefTurnForSession } from "@/lib/orchestration/run-debrief-turn";
import { SessionLogPersistenceError } from "@/lib/orchestration/run-session-log-signal-pipeline";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * US-05, Lot L2 (ADR-019 §3) — écriture précoce du réalisé depuis un débrief.
 *
 * Les quatre livrables vérifiables du lot :
 *   ① conversation interrompue après le trio ⟹ un log valide existe ;
 *   ② `rpe = 9` ⟹ trace `progression.negative_signal_reduction`, charge −20 % ;
 *   ③ une reprise enrichit par `PATCH`, jamais par un second log ;
 *   ④ `pain ≠ none` sans zone est refusé par Zod ET par `pain_zone_required`.
 *
 * Les tours passent par le mock déterministe. Ce que ces tests prouvent, c'est la MÉCANIQUE pour
 * des extractions correctes. La justesse des extractions du vrai modèle reste à valider (point ⛔,
 * amendement ADR-019 du 2026-09-26).
 */
const admin = serviceRoleClient();

/** Utilisateur avec plan actif, et la première séance non-repos du plan. `now` = la date de la
 *  séance, comme dans `session-log-adjustment.test.ts`. */
async function seed(label: string, opts: { consent?: boolean } = {}) {
  const user = await createTestUser(label);
  if (opts.consent !== false) await grantHealthConsents(admin, user.id);
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
  return { user, plannedSessionId: session.id, now: session.scheduled_date, planVersionId: initial.planVersionId };
}

function turn(user: TestUser, plannedSessionId: string, now: string, userMessage: string) {
  return runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage, now });
}

async function logsFor(plannedSessionId: string) {
  const { data, error } = await admin
    .from("session_logs")
    .select("id, completion, pain, pain_zone, rpe, freshness")
    .eq("planned_session_id", plannedSessionId);
  if (error) throw error;
  return data ?? [];
}

describe("débrief post-séance — écriture précoce (US-05 L2, ADR-019 §3)", () => {
  const users: TestUser[] = [];
  afterAll(async () => {
    for (const user of users) await deleteTestUser(user.id);
  });

  it("① une conversation interrompue après le trio laisse un log valide", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l2-interrompu");
    users.push(user);

    const t1 = await turn(user, plannedSessionId, now, "Oui c'est fait");
    // `pain` manque encore : rien n'est écrit.
    expect(t1.logWrite).toBeNull();
    expect(await logsFor(plannedSessionId)).toHaveLength(0);

    const t2 = await turn(user, plannedSessionId, now, "Aucune douleur");
    expect(t2.logWrite?.kind).toBe("created");

    // L'utilisateur s'arrête là : ni rpe ni freshness. Le log existe quand même, et il est valide.
    const logs = await logsFor(plannedSessionId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ completion: "done", pain: "none", rpe: null, freshness: null });

    const { data: debrief } = await admin
      .from("debrief_sessions")
      .select("status, session_log_id")
      .eq("planned_session_id", plannedSessionId)
      .single();
    expect(debrief?.status).toBe("in_progress");
    expect(debrief?.session_log_id).toBe(logs[0]!.id);
  });

  it("② un rpe de 9 déclenche la baisse de 20 % de la charge de la semaine", async () => {
    const { user, plannedSessionId, now, planVersionId } = await seed("debrief-l2-rpe");
    users.push(user);

    await turn(user, plannedSessionId, now, "Oui c'est fait");
    await turn(user, plannedSessionId, now, "Aucune douleur");
    const t3 = await turn(user, plannedSessionId, now, "Franchement dur, 9 sur 10");

    expect(t3.logWrite?.kind).toBe("updated");
    expect(t3.logWrite?.result.adjustment.applied).toBe(true);
    expect(t3.logWrite?.result.adjustment.direction).toBe("decrease");

    const newVersionId = t3.logWrite!.result.adjustment.planVersionId!;
    expect(newVersionId).not.toBe(planVersionId);
    const { data: version } = await admin.from("plan_versions").select("trigger").eq("id", newVersionId).single();
    expect(version?.trigger).toBe("negative_signal");

    const { data: traces, error } = await admin
      .from("decision_traces")
      .select("output")
      .eq("plan_version_id", newVersionId)
      .eq("rule_id", "progression.negative_signal_reduction");
    if (error) throw error;
    expect(traces).toHaveLength(1);
    const output = traces![0]!.output as { before: number; after: number; direction: string };
    expect(output.direction).toBe("decrease");
    expect(output.after).toBe(Math.round(output.before * 0.8));
  });

  it("③ une reprise enrichit le log par PATCH, jamais par un second log", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l2-reprise");
    users.push(user);

    await turn(user, plannedSessionId, now, "Oui c'est fait");
    const t2 = await turn(user, plannedSessionId, now, "Aucune douleur");
    const logId = t2.logWrite!.logId;

    const t3 = await turn(user, plannedSessionId, now, "C'était 6 sur 10");
    expect(t3.logWrite).toMatchObject({ kind: "updated", logId });

    // Un tour qui n'apporte rien de nouveau n'écrit rien : pas de pipeline relancé pour rien.
    const t4 = await turn(user, plannedSessionId, now, "Merci");
    expect(t4.logWrite).toBeNull();
    expect(t4.sessionLogId).toBe(logId);

    const t5 = await turn(user, plannedSessionId, now, "Et la forme 4");
    expect(t5.logWrite).toMatchObject({ kind: "updated", logId });

    const logs = await logsFor(plannedSessionId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ id: logId, rpe: 6, freshness: 4 });
  });

  it("③ bis un log déjà saisi par le formulaire est adopté, pas doublé", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l2-adoption");
    users.push(user);

    const viaForm = await applyDailyLog(user.client, admin, {
      userId: user.id,
      now,
      input: CreateSessionLogInputSchema.parse({ plannedSessionId, loggedDate: now, completion: "done", pain: "none" }),
    });

    await turn(user, plannedSessionId, now, "Oui c'est fait");
    const t2 = await turn(user, plannedSessionId, now, "Une gêne au mollet");
    expect(t2.logWrite).toMatchObject({ kind: "updated", logId: viaForm.logId });

    const logs = await logsFor(plannedSessionId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ id: viaForm.logId, pain: "light", pain_zone: "calf" });
  });

  it("④ une douleur sans zone n'est jamais écrite : refusée par Zod et par la base", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l2-zone");
    users.push(user);

    await turn(user, plannedSessionId, now, "Oui c'est fait");
    const t2 = await turn(user, plannedSessionId, now, "J'ai eu une douleur");
    // Le trio n'est pas complet tant que la zone manque : aucune écriture.
    expect(t2.draft.pain).toBe("pain");
    expect(t2.missingMandatory).toEqual(["painZone"]);
    expect(t2.logWrite).toBeNull();
    expect(await logsFor(plannedSessionId)).toHaveLength(0);

    // Défense 1 : le schéma que `writeDebriefLog()` applique au brouillon.
    const zod = CreateSessionLogInputSchema.safeParse({ plannedSessionId, loggedDate: now, completion: "done", pain: "pain" });
    expect(zod.success).toBe(false);
    expect(zod.error?.issues.map((issue) => issue.path.join("."))).toContain("painZone");

    // Défense 2 : la contrainte SQL, même en `service_role`, donc hors de toute validation applicative.
    const { error } = await admin
      .from("session_logs")
      .insert({ user_id: user.id, planned_session_id: plannedSessionId, logged_date: now, completion: "done", pain: "pain" });
    expect(error?.message ?? "").toMatch(/pain_zone_required/);
  });

  it("sans consentement santé, l'écriture est refusée par RLS et l'échange reste intact", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l2-consentement", { consent: false });
    users.push(user);

    await turn(user, plannedSessionId, now, "Oui c'est fait");
    await expect(turn(user, plannedSessionId, now, "Aucune douleur")).rejects.toBeInstanceOf(SessionLogPersistenceError);
    expect(await logsFor(plannedSessionId)).toHaveLength(0);

    // Le tour a été persisté AVANT la tentative d'écriture : le suivant la retentera.
    const { data: debrief } = await admin
      .from("debrief_sessions")
      .select("turn_count, draft, session_log_id")
      .eq("planned_session_id", plannedSessionId)
      .single();
    expect(debrief).toMatchObject({ turn_count: 2, session_log_id: null });
    expect(debrief?.draft).toMatchObject({ completion: "done", pain: "none" });
  });
});
