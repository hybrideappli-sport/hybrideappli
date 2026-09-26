import { afterAll, describe, expect, it } from "vitest";

import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { runDebriefTurnForSession, DebriefSessionNotFoundError } from "@/lib/orchestration/run-debrief-turn";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { createTestUser, deleteTestUser, grantHealthConsents, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * US-05, Lot L1 (ADR-019) — socle conversationnel du débrief post-séance.
 *
 * Les quatre livrables vérifiables du lot, un par test :
 *   ① une conversation complète produit un brouillon conforme au schéma ;
 *   ② une extraction hors énumération est ÉCARTÉE, le tour requalifié en reformulation ;
 *   ③ AUCUNE écriture dans `session_logs` — borne levée au Lot L2, qui écrit dès le trio
 *     obtenu : ce test vérifie désormais l'inverse, voir `debrief-ecriture.test.ts` ;
 *   ④ deux conversations pour la même séance sont impossibles.
 */
const admin = serviceRoleClient();

async function seedAvailability(userId: string) {
  const rows = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
    { user_id: userId, weekday, slot: "am" as const, max_minutes: 120, is_available: true },
    { user_id: userId, weekday, slot: "pm" as const, max_minutes: 120, is_available: true },
  ]);
  const { error } = await admin.from("availability_slots").insert(rows);
  if (error) throw new Error(`[test] availability_slots : ${error.message}`);
}

/** Un utilisateur avec un plan généré, et l'identifiant d'une séance à débriefer. */
async function seedUserWithSession(label: string): Promise<{ user: TestUser; plannedSessionId: string; now: string }> {
  const user = await createTestUser(label);
  // Depuis le Lot L2, un tour peut écrire le réalisé par le client RLS de l'utilisateur : le
  // consentement santé doit réellement être en base.
  await grantHealthConsents(admin, user.id);
  const { objectiveId } = await seedAthleteAndObjective(admin, user.id);
  await seedAvailability(user.id);

  const now = todayInTimezone("Europe/Paris");
  const plan = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
  if (plan.outcome !== "plan_generated") throw new Error(`[test] plan attendu 'plan_generated', obtenu '${plan.outcome}'`);

  const { data: sessions, error } = await admin
    .from("planned_sessions")
    .select("id")
    .eq("user_id", user.id)
    .neq("session_type", "rest")
    .limit(1);
  if (error) throw new Error(`[test] planned_sessions : ${error.message}`);
  expect(sessions?.length).toBeGreaterThan(0);
  return { user, plannedSessionId: sessions![0]!.id, now };
}

describe("débrief post-séance — socle conversationnel (US-05 L1, ADR-019)", () => {
  const users: TestUser[] = [];

  afterAll(async () => {
    for (const user of users) await deleteTestUser(user.id);
  });

  it("une conversation complète accumule un brouillon conforme, et un seul log le reflète", async () => {
    const { user, plannedSessionId, now } = await seedUserWithSession("debrief-complet");
    users.push(user);

    const tour1 = await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage: "Oui c'est fait", now });
    expect(tour1.draft.completion).toBe("done");
    // `pain` reste à obtenir : le coach ne peut pas clore.
    expect(tour1.missingMandatory).toContain("pain");
    expect(tour1.canClose).toBe(false);

    const tour2 = await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage: "Aucune douleur", now });
    expect(tour2.draft.pain).toBe("none");
    expect(tour2.missingMandatory).toEqual([]);
    // Les deux signaux recherchés sont demandés ensemble, jamais l'un après l'autre (ADR-019 §6).
    expect(tour2.missingDesired).toEqual(["rpe", "freshness"]);

    const tour3 = await runDebriefTurnForSession(user.client, admin, {
      userId: user.id,
      plannedSessionId,
      now,
      userMessage: "C'était 7 sur 10, et la forme 4",
    });
    expect(tour3.draft.rpe).toBe(7);
    expect(tour3.draft.freshness).toBe(4);
    expect(tour3.canClose).toBe(true);

    // ③ Inversé au Lot L2 : le trio obtenu au tour 2 a produit UN log, enrichi au tour 3.
    const { data: logs } = await admin.from("session_logs").select("id, rpe, freshness").eq("user_id", user.id);
    expect(logs ?? []).toHaveLength(1);
    expect(logs![0]).toMatchObject({ rpe: 7, freshness: 4 });

    // La conversation est marquée close, et le brouillon est bien persisté.
    const { data: debrief } = await admin
      .from("debrief_sessions")
      .select("status, draft, turn_count, session_log_id")
      .eq("planned_session_id", plannedSessionId)
      .single();
    expect(debrief?.status).toBe("completed");
    expect(debrief?.turn_count).toBe(3);
    expect(debrief?.session_log_id).toBe(logs![0]!.id);
    expect(debrief?.draft).toMatchObject({ completion: "done", pain: "none", rpe: 7, freshness: 4 });
  });

  it("une zone corporelle hors référentiel est écartée, et le tour devient une reformulation", async () => {
    const { user, plannedSessionId, now } = await seedUserWithSession("debrief-zone-invalide");
    users.push(user);

    await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage: "Oui c'est fait", now });

    // Le mock reproduit ici le mode d'échec réel d'un modèle : une zone latéralisée qu'il ne sait
    // pas mapper sort en `genou_droit`, là où le contrat n'accepte que `knee`. C'est exactement
    // l'incident `course_a_pied` du 2026-09-18, transposé à une donnée de santé.
    const tour = await runDebriefTurnForSession(user.client, admin, {
      userId: user.id,
      plannedSessionId,
      now,
      userMessage: "J'ai une douleur au genou droit",
    });

    expect(tour.extractionPatch).toBeNull();
    expect(tour.isReformulation).toBe(true);
    // Rien n'est entré dans le brouillon — pas même la douleur, pourtant correctement détectée :
    // `.strict()` rejette le patch ENTIER, jamais champ par champ.
    expect(tour.draft.pain).toBeUndefined();
    expect(tour.draft.painZone).toBeUndefined();
    expect(tour.missingMandatory).toContain("pain");

    // L'extraction rejetée n'est pas persistée, pas même à titre de trace.
    const { data: messages } = await admin
      .from("debrief_messages")
      .select("role, extraction, is_reformulation")
      .eq("user_id", user.id)
      .eq("role", "coach")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(messages?.[0]?.extraction).toBeNull();
    expect(messages?.[0]?.is_reformulation).toBe(true);
  });

  it("une zone reconnue entre bien dans le brouillon, avec son code du contrat", async () => {
    const { user, plannedSessionId, now } = await seedUserWithSession("debrief-zone-valide");
    users.push(user);

    await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage: "Oui c'est fait", now });
    const tour = await runDebriefTurnForSession(user.client, admin, {
      userId: user.id,
      plannedSessionId,
      now,
      userMessage: "Une gêne au mollet",
    });

    expect(tour.draft.pain).toBe("light");
    expect(tour.draft.painZone).toBe("calf");
    expect(tour.missingMandatory).toEqual([]);
  });

  it("deux conversations pour la même séance sont impossibles — les tours alimentent la même", async () => {
    const { user, plannedSessionId, now } = await seedUserWithSession("debrief-unicite");
    users.push(user);

    const premier = await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage: "Oui c'est fait", now });
    const second = await runDebriefTurnForSession(user.client, admin, { userId: user.id, plannedSessionId, userMessage: "Aucune douleur", now });
    expect(second.debriefSessionId).toBe(premier.debriefSessionId);

    const { count } = await admin
      .from("debrief_sessions")
      .select("id", { count: "exact", head: true })
      .eq("planned_session_id", plannedSessionId);
    expect(count).toBe(1);

    // L'unicité est portée par la base, pas seulement par le code : l'insertion directe échoue.
    const { error } = await admin
      .from("debrief_sessions")
      .insert({ user_id: user.id, planned_session_id: plannedSessionId });
    expect(error?.message ?? "").toMatch(/duplicate key|unique/i);
  });

  it("une séance qui n'appartient pas à l'utilisateur est introuvable", async () => {
    const { user, plannedSessionId, now } = await seedUserWithSession("debrief-proprietaire");
    users.push(user);
    const autre = await createTestUser("debrief-intrus");
    users.push(autre);

    await expect(
      runDebriefTurnForSession(autre.client, admin, { userId: autre.id, plannedSessionId, userMessage: "Oui c'est fait", now }),
    ).rejects.toBeInstanceOf(DebriefSessionNotFoundError);
  });
});
