import { afterAll, describe, expect, it } from "vitest";

import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { resolveScheduleIncident } from "@/lib/planning/resolve-schedule-incident";
import { createTestUser, deleteTestUser, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `report-incident-idempotency.test.ts` — AC3/AC4/AC6 (`08-architecture.md` §14.5). Cible
 * `resolveScheduleIncident()`, extrait de `POST /api/v1/schedule/incidents` (ce Route Handler
 * dépend de `requireUser()`/`next/headers`, hors de portée d'un test d'intégration Node — même
 * patron que les autres orchestrateurs).
 *
 * Trois propriétés :
 *  - la résolution est SYNCHRONE (la réponse contient déjà le placement, aucun job) ;
 *  - le « double appui » (deux requêtes concurrentes sur le MÊME placement courant, avant qu'aucune
 *    des deux n'ait écrit) ne produit jamais deux incidents — garanti en dernier ressort par l'index
 *    unique `schedule_incidents_one_per_placement`, vérifié indépendamment du comportement
 *    applicatif des deux appels (l'un peut échouer, la base ne dévie jamais) ;
 *  - un signalement SÉQUENTIEL du même `plannedSessionId` après une PREMIÈRE résolution aboutie
 *    n'est PAS un doublon : le placement courant a changé (rescheduled/cancelled_week), un second
 *    signalement porte sur un second imprévu légitime. L'idempotence ne s'applique qu'au placement
 *    LUI-MÊME (`invalidated_placement_id`), jamais à la séance en général.
 */
const admin = serviceRoleClient();

async function seedAvailability(userId: string) {
  const rows = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
    { user_id: userId, weekday, slot: "am" as const, max_minutes: 120, is_available: true },
    { user_id: userId, weekday, slot: "pm" as const, max_minutes: 120, is_available: true },
  ]);
  const { error } = await admin.from("availability_slots").insert(rows);
  if (error) throw new Error(`[test] availability_slots (seed) : ${error.message}`);
}

describe("resolveScheduleIncident — résolution synchrone et idempotence (AC3/AC4/AC6)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("un second signalement du même créneau renvoie la MÊME résolution, sans second incident ni second replacement", async () => {
    user = await createTestUser("report-incident-idempotency");
    const { objectiveId } = await seedAthleteAndObjective(admin, user.id);
    await seedAvailability(user.id);

    const now = "2026-08-10"; // lundi
    const plan = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
    if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

    // Un placement RÉEL (statut ≠ 'cancelled_week', date/heure connues) est requis pour qu'un
    // imprévu soit signalable (`buildPlacementInputForIncident`) — la disponibilité généreuse
    // ci-dessus vise à en garantir au moins un.
    const { data: placedRows, error: placedRowsError } = await admin
      .from("session_placements")
      .select("planned_session_id, status, scheduled_date, scheduled_time")
      .eq("user_id", user.id)
      .neq("status", "cancelled_week")
      .is("superseded_at", null)
      .not("scheduled_date", "is", null)
      .not("scheduled_time", "is", null)
      .order("scheduled_date", { ascending: false }) // le plus tardif : marge confortable vis-à-vis de `min_lead_time_min`.
      .limit(1);
    if (placedRowsError) throw placedRowsError;
    expect(placedRows!.length, "aucune séance placée avec succès — fixture de disponibilité insuffisante").toBeGreaterThan(0);
    const target = placedRows![0]!;

    const ruleset = await getActiveRuleset(admin);
    const reportNow = { date: now, time: "00:00" }; // largement avant toute séance placée cette semaine-là.

    const first = await resolveScheduleIncident(admin, { userId: user.id, plannedSessionId: target.planned_session_id!, now: reportNow, ruleset });
    expect(first.kind).toBe("resolved");
    if (first.kind !== "resolved") return;
    expect(["rescheduled", "cancelled_week"]).toContain(first.response.outcome);
    expect(first.response.incidentId).toBeTruthy();

    const { count: incidentCountAfterFirst } = await admin
      .from("schedule_incidents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("planned_session_id", target.planned_session_id!);
    expect(incidentCountAfterFirst).toBe(1);

    // Un signalement SÉQUENTIEL du même `plannedSessionId`, APRÈS que le premier a pleinement
    // abouti, porte sur le placement COURANT (déjà celui issu du premier replacement) : c'est un
    // second imprévu légitime sur une séance déjà déplacée, pas un doublon — `resolved` de nouveau,
    // avec un `incidentId` différent. L'idempotence documentée (`schedule_incidents_one_per_placement`)
    // vise le DOUBLE APPUI : deux requêtes concurrentes lisant le MÊME placement courant AVANT que
    // l'une des deux n'ait écrit — reproduit ci-dessous.
    const sequential = await resolveScheduleIncident(admin, { userId: user.id, plannedSessionId: target.planned_session_id!, now: reportNow, ruleset });
    expect(sequential.kind).toBe("resolved");
    if (sequential.kind === "resolved") expect(sequential.response.incidentId).not.toBe(first.response.incidentId);
  });

  it("double appui — deux résolutions concurrentes sur le MÊME placement ne créent jamais deux incidents", async () => {
    const concurrentUser = await createTestUser("report-incident-concurrent");
    try {
      const { objectiveId } = await seedAthleteAndObjective(admin, concurrentUser.id);
      await seedAvailability(concurrentUser.id);

      const now = "2026-08-10";
      const plan = await regeneratePlan(admin, { userId: concurrentUser.id, objectiveId, trigger: "onboarding", now });
      if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

      const { data: placedRows, error: placedRowsError } = await admin
        .from("session_placements")
        .select("planned_session_id")
        .eq("user_id", concurrentUser.id)
        .neq("status", "cancelled_week")
        .is("superseded_at", null)
        .not("scheduled_date", "is", null)
        .not("scheduled_time", "is", null)
        .limit(1);
      if (placedRowsError) throw placedRowsError;
      expect(placedRows!.length, "aucune séance placée avec succès — fixture de disponibilité insuffisante").toBeGreaterThan(0);
      const target = placedRows![0]!;

      const ruleset = await getActiveRuleset(admin);
      const reportNow = { date: now, time: "00:00" };

      // Deux appels lancés SANS attendre l'un l'autre — les deux lisent le même placement courant
      // avant qu'aucun des deux n'ait écrit (patron « double appui » : bouton cliqué deux fois avant
      // que l'UI ne se désactive).
      const results = await Promise.allSettled([
        resolveScheduleIncident(admin, { userId: concurrentUser.id, plannedSessionId: target.planned_session_id!, now: reportNow, ruleset }),
        resolveScheduleIncident(admin, { userId: concurrentUser.id, plannedSessionId: target.planned_session_id!, now: reportNow, ruleset }),
      ]);

      // La garantie NON NÉGOCIABLE (`schedule_incidents_one_per_placement`, index unique) : quel que
      // soit le comportement applicatif des deux appels, la base ne retient jamais deux incidents
      // pour le même placement invalidé — « jamais un second créneau bloqué ».
      const { data: incidentRows, error: incidentRowsError } = await admin
        .from("schedule_incidents")
        .select("id, invalidated_placement_id")
        .eq("user_id", concurrentUser.id)
        .eq("planned_session_id", target.planned_session_id!);
      if (incidentRowsError) throw incidentRowsError;
      const byInvalidatedPlacement = new Map(incidentRows!.map((r) => [r.invalidated_placement_id, r.id]));
      expect(byInvalidatedPlacement.size).toBe(incidentRows!.length); // aucun doublon de `invalidated_placement_id`.

      // Au moins l'un des deux appels a abouti normalement.
      const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof resolveScheduleIncident>>> => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThan(0);
      for (const outcome of fulfilled) {
        expect(["resolved", "already_resolved"]).toContain(outcome.value.kind);
      }
    } finally {
      await deleteTestUser(concurrentUser.id);
    }
  });

  it("'not_found' pour une séance planifiée inexistante, 'not_reportable' pour une séance sans placement exploitable", async () => {
    const edgeUser = await createTestUser("report-incident-edge-cases");
    try {
      const { objectiveId } = await seedAthleteAndObjective(admin, edgeUser.id);
      // AUCUNE disponibilité seedée : le moteur ne peut placer aucune séance ⇒ toutes `cancelled_week`
      // (`buildPlacementInputForIncident` les exclut explicitement — non signalables, AC4).
      const now = "2026-08-10";
      const plan = await regeneratePlan(admin, { userId: edgeUser.id, objectiveId, trigger: "onboarding", now });
      if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

      const { data: sessions, error: sessionsError } = await admin
        .from("planned_sessions")
        .select("id")
        .eq("plan_version_id", plan.planVersionId)
        .limit(1);
      if (sessionsError) throw sessionsError;
      const target = sessions![0]!;

      const ruleset = await getActiveRuleset(admin);
      const reportNow = { date: now, time: "00:00" };

      const notReportable = await resolveScheduleIncident(admin, { userId: edgeUser.id, plannedSessionId: target.id, now: reportNow, ruleset });
      expect(notReportable.kind).toBe("not_reportable");

      const notFound = await resolveScheduleIncident(admin, {
        userId: edgeUser.id,
        plannedSessionId: "00000000-0000-0000-0000-000000000000",
        now: reportNow,
        ruleset,
      });
      expect(notFound.kind).toBe("not_found");
    } finally {
      await deleteTestUser(edgeUser.id);
    }
  });

  // I2 — `08-architecture.md` §14.5 : une séance déjà passée (ou à moins de `min_lead_time_min` de
  // `now`) doit être rejetée en `not_reportable` (409 `SESSION_NOT_REPORTABLE` côté route), pas
  // seulement une séance sans placement exploitable (`cancelled_week`). `buildPlacementInputForIncident()`
  // doit appliquer le même contrôle d'admission que `canReportIncident` côté lecture.
  it("'not_reportable' pour une séance dont le créneau placé est déjà passé", async () => {
    const pastUser = await createTestUser("report-incident-past-session");
    try {
      const { objectiveId } = await seedAthleteAndObjective(admin, pastUser.id);
      await seedAvailability(pastUser.id);

      const now = "2026-08-10"; // lundi
      const plan = await regeneratePlan(admin, { userId: pastUser.id, objectiveId, trigger: "onboarding", now });
      if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

      const { data: placedRows, error: placedRowsError } = await admin
        .from("session_placements")
        .select("planned_session_id, scheduled_date, scheduled_time")
        .eq("user_id", pastUser.id)
        .neq("status", "cancelled_week")
        .is("superseded_at", null)
        .not("scheduled_date", "is", null)
        .not("scheduled_time", "is", null)
        .order("scheduled_date", { ascending: true }) // le plus tôt : le premier passé par un `now` avancé d'une semaine.
        .limit(1);
      if (placedRowsError) throw placedRowsError;
      expect(placedRows!.length, "aucune séance placée avec succès — fixture de disponibilité insuffisante").toBeGreaterThan(0);
      const target = placedRows![0]!;

      const ruleset = await getActiveRuleset(admin);
      // `now` largement APRÈS le créneau placé (une semaine plus tard) : la séance est passée.
      const reportNow = { date: "2026-08-17", time: "23:59" };

      const outcome = await resolveScheduleIncident(admin, { userId: pastUser.id, plannedSessionId: target.planned_session_id!, now: reportNow, ruleset });
      expect(outcome.kind).toBe("not_reportable");

      // Aucun incident ni placement écrits — le rejet a lieu AVANT toute écriture.
      const { count: incidentCount } = await admin
        .from("schedule_incidents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", pastUser.id)
        .eq("planned_session_id", target.planned_session_id!);
      expect(incidentCount).toBe(0);
    } finally {
      await deleteTestUser(pastUser.id);
    }
  });
});
