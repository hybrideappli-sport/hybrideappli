import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DeterministicMockLlmProvider, type LlmProvider } from "@hybride/coach-llm";
import type { DebriefTurnInput } from "@hybride/coach-llm";

import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * US-05, Lot L3 (ADR-019 §6 et §Conséquences) — ce que l'écran de débrief attend du serveur.
 *
 *   ② LLM en échec ⟹ `DebriefLlmUnavailableError`, rien d'écrit, l'échange conservé : la route en
 *     fait un 503 et l'écran bascule sur le formulaire (vérifié de bout en bout par
 *     `e2e/debrief-chat.spec.ts`) ;
 *   ③ deux incompréhensions ⟹ questions fermées ; une réponse par chips n'appelle PAS le modèle, et
 *     mène jusqu'au log et à l'ajustement.
 *
 * Les livrables ① (conversation → log → plan ajusté, à l'écran) et ④ (paywall : formulaire, aucun
 * appel LLM) sont des comportements d'écran et de route, vérifiés en E2E.
 */

const { getLlmProviderMock } = vi.hoisted(() => ({ getLlmProviderMock: vi.fn() }));
vi.mock("@/lib/coach-llm-provider", () => ({ getLlmProvider: getLlmProviderMock }));

const { regeneratePlan } = await import("@/lib/orchestration/regenerate-plan");
const { applyDebriefChoiceForSession, DebriefLlmUnavailableError, runDebriefTurnForSession } = await import("@/lib/orchestration/run-debrief-turn");
const { readDebriefForSession } = await import("@/lib/orchestration/read-debrief-for-session");

/** Le mock déterministe, avec un compteur d'appels au débrief. */
class CountingProvider extends DeterministicMockLlmProvider {
  debriefCalls = 0;
  override converseDebrief(input: DebriefTurnInput) {
    this.debriefCalls += 1;
    return super.converseDebrief(input);
  }
}

class FailingDebriefProvider extends DeterministicMockLlmProvider {
  override converseDebrief(): Promise<never> {
    return Promise.reject(new Error("[test] fournisseur LLM indisponible (débrief)."));
  }
}

let provider: LlmProvider = new CountingProvider();
getLlmProviderMock.mockImplementation(() => provider);

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

describe("débrief post-séance — ce que l'écran attend du serveur (US-05 L3)", () => {
  const users: TestUser[] = [];
  beforeEach(() => {
    provider = new CountingProvider();
  });
  afterAll(async () => {
    for (const user of users) await deleteTestUser(user.id);
  });

  it("③ deux incompréhensions mènent aux questions fermées, et les chips vont jusqu'au log sans appeler le modèle", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l3-chips");
    users.push(user);
    const base = { userId: user.id, plannedSessionId, now };
    const counting = provider as CountingProvider;

    const t1 = await runDebriefTurnForSession(user.client, admin, { ...base, userMessage: "bof" });
    expect(t1.isReformulation).toBe(true);
    expect(t1.closedQuestion).toBeNull();

    const t2 = await runDebriefTurnForSession(user.client, admin, { ...base, userMessage: "euh" });
    expect(t2.reachedReformulationLimit).toBe(true);
    expect(t2.closedQuestion?.groups.map((g) => g.field)).toEqual(["completion"]);
    expect(t2.closedQuestion?.skippable).toBe(false);

    // La reprise de l'écran retrouve les chips : le compteur est relu depuis le journal.
    expect((await readDebriefForSession(admin, { userId: user.id, plannedSessionId, sessionLogId: null }))?.closedQuestion?.groups[0]?.field).toBe("completion");

    const callsBeforeChips = counting.debriefCalls;

    const c1 = await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { completion: "done" } });
    expect(c1.closedQuestion?.groups.map((g) => g.field)).toEqual(["pain"]);
    expect(c1.logWrite).toBeNull();

    const c2 = await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { pain: "pain" } });
    expect(c2.closedQuestion?.groups.map((g) => g.field)).toEqual(["painZone"]);
    expect(c2.logWrite).toBeNull();

    const c3 = await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { painZone: "knee" } });
    expect(c3.logWrite?.kind).toBe("created");
    // Puis `rpe` et `freshness` ENSEMBLE, en une seule question qu'on peut passer (ADR-019 §6).
    expect(c3.closedQuestion?.groups.map((g) => g.field)).toEqual(["rpe", "freshness"]);
    expect(c3.closedQuestion?.skippable).toBe(true);

    const c4 = await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { rpe: 9, freshness: 2 } });
    expect(c4.logWrite?.kind).toBe("updated");
    expect(c4.logWrite?.result.adjustment.direction).toBe("decrease");
    expect(c4.closedQuestion).toBeNull();
    expect(c4.canClose).toBe(true);

    expect(counting.debriefCalls).toBe(callsBeforeChips);

    const { data: log } = await admin
      .from("session_logs")
      .select("completion, pain, pain_zone, rpe, freshness")
      .eq("planned_session_id", plannedSessionId)
      .single();
    expect(log).toEqual({ completion: "done", pain: "pain", pain_zone: "knee", rpe: 9, freshness: 2 });

    const { data: debrief } = await admin.from("debrief_sessions").select("status").eq("planned_session_id", plannedSessionId).single();
    expect(debrief?.status).toBe("completed");
  });

  it("③ passer la question rpe / freshness clôt l'échange sans insister", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l3-passer");
    users.push(user);
    const base = { userId: user.id, plannedSessionId, now };

    await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { completion: "done" } });
    const c2 = await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { pain: "none" } });
    expect(c2.closedQuestion?.skippable).toBe(true);

    const skip = await applyDebriefChoiceForSession(user.client, admin, { ...base, choice: { skip: true } });
    expect(skip.closedQuestion).toBeNull();
    expect(skip.canClose).toBe(true);
    expect(skip.logWrite).toBeNull();
  });

  it("une réponse comprise remet le compteur de reformulations à zéro", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l3-compteur");
    users.push(user);
    const base = { userId: user.id, plannedSessionId, now };

    await runDebriefTurnForSession(user.client, admin, { ...base, userMessage: "bof" });
    await runDebriefTurnForSession(user.client, admin, { ...base, userMessage: "Oui c'est fait" });
    const t3 = await runDebriefTurnForSession(user.client, admin, { ...base, userMessage: "euh" });
    expect(t3.isReformulation).toBe(true);
    expect(t3.reformulationCount).toBe(1);
    expect(t3.closedQuestion).toBeNull();
  });

  it("② un fournisseur en échec lève DebriefLlmUnavailableError, sans rien écrire ni perdre l'échange", async () => {
    const { user, plannedSessionId, now } = await seed("debrief-l3-llm-panne");
    users.push(user);

    await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, now, userMessage: "Oui c'est fait" });

    provider = new FailingDebriefProvider();
    await expect(
      runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, now, userMessage: "Aucune douleur" }),
    ).rejects.toBeInstanceOf(DebriefLlmUnavailableError);

    const { count } = await admin.from("session_logs").select("id", { count: "exact", head: true }).eq("planned_session_id", plannedSessionId);
    expect(count).toBe(0);

    // Le message de l'utilisateur est conservé ; aucune réponse du coach n'a été inventée.
    const view = await readDebriefForSession(admin, { userId: user.id, plannedSessionId, sessionLogId: null });
    expect(view?.messages.map((m) => m.role)).toEqual(["coach", "user", "coach", "user"]);
    expect(view?.messages.at(-1)?.content).toBe("Aucune douleur");
  });
});
