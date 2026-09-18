import { afterAll, describe, expect, it } from "vitest";

import { runRefreshPlacements } from "@/lib/jobs/refresh-placements";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { todayInTimezone } from "@/lib/orchestration/today-in-timezone";
import { resolveScheduleIncident } from "@/lib/planning/resolve-schedule-incident";
import { createTestUser, deleteTestUser, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * Couverture des DEUX appelants de `materializeSessionPlacements()` qui relisent une origine
 * depuis la base — `refresh_placements` et `resolveScheduleIncident()`. Ni l'un ni l'autre
 * n'était testé sur le cas « replacé sur son créneau d'origine », et c'est cette absence qui a
 * laissé un bug de production invisible jusqu'au 2026-09-18.
 *
 * Le bug : `place-week-sessions.ts` comparait `formatTime(chosen.startMin)` — `"07:00"` — à
 * `origin.time` relu d'une colonne `time without time zone`, que Postgres sérialise `"07:00:00"`.
 * L'égalité de chaînes était donc toujours fausse, une séance replacée à l'identique était
 * étiquetée `moved`, et la base refusait l'insertion
 * (`session_placements_moved_differs_from_origin` : un `moved` doit différer réellement de son
 * origine).
 *
 * Conséquence, et raison pour laquelle ces tests existent : le chemin NOMINAL échouait à 100 %
 * (rien n'a bougé ⟹ même créneau ⟹ violation) tandis que le chemin exceptionnel fonctionnait
 * (créneau réellement différent ⟹ contrainte satisfaite). Un utilisateur qui modifiait ses
 * disponibilités voyait son planning rester figé, sans aucune erreur visible — le job échouait,
 * réessayait, puis était abandonné après `MAX_JOB_ATTEMPTS`.
 *
 * `regeneratePlan()`, troisième appelant, n'a jamais été concerné : pour des séances fraîches
 * `origin` est `null` et `place-week-sessions.ts` le reconstruit en mémoire via `formatTime()`.
 * Les deux côtés sont alors au même format et la comparaison était juste.
 */
const admin = serviceRoleClient();

/**
 * Le plan DOIT être généré sur l'horloge réelle, et non sur une date fixe.
 * `runRefreshPlacements()` lit l'heure courante via `nowPartsInTimezone()`, et
 * `buildPlacementInputForWeek()` GÈLE toute séance passée ou à moins de `min_lead_time_min`
 * (`build-placement-input.ts:117`, `continue`). Avec une date figée dans le passé, le
 * rafraîchissement ne produit aucune décision, n'insère rien — et le test passerait à vide, y
 * compris sans le correctif. C'est exactement le piège dans lequel une première version de ce
 * fichier est tombée.
 */
const AUJOURD_HUI = todayInTimezone("Europe/Paris");

async function seedAvailability(userId: string) {
  const rows = [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
    { user_id: userId, weekday, slot: "am" as const, max_minutes: 120, is_available: true },
    { user_id: userId, weekday, slot: "pm" as const, max_minutes: 120, is_available: true },
  ]);
  const { error } = await admin.from("availability_slots").insert(rows);
  if (error) throw new Error(`[test] availability_slots (seed) : ${error.message}`);
}

/** Placements courants (non supersédés) de l'utilisateur, ordonnés pour une comparaison stable. */
async function currentPlacements(userId: string) {
  const { data, error } = await admin
    .from("session_placements")
    .select("planned_session_id, status, scheduled_date, scheduled_time, origin_date, origin_time")
    .eq("user_id", userId)
    .is("superseded_at", null)
    .order("scheduled_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`[test] lecture session_placements : ${error.message}`);
  return data ?? [];
}

describe("placement — replacement sur le créneau d'origine (AC2, ADR-016)", () => {
  const users: TestUser[] = [];

  afterAll(async () => {
    for (const user of users) await deleteTestUser(user.id);
  });

  it("le job refresh_placements réussit quand la disponibilité est inchangée, et n'invente pas de 'moved'", async () => {
    const user = await createTestUser("refresh-same-slot");
    users.push(user);
    const { objectiveId } = await seedAthleteAndObjective(admin, user.id);
    await seedAvailability(user.id);

    const now = AUJOURD_HUI;
    const plan = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
    if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

    const avant = await currentPlacements(user.id);
    expect(avant.length).toBeGreaterThan(0);

    // Cœur du test : AUCUNE disponibilité n'a changé entre la génération et ce rafraîchissement.
    // Chaque séance est donc redécidée sur son créneau d'origine — le cas qui violait la
    // contrainte. Avant correction, cet appel levait :
    //   materializeSessionPlacements: session_placements (insert) — new row for relation
    //   "session_placements" violates check constraint
    //   "session_placements_moved_differs_from_origin"
    await expect(runRefreshPlacements(admin, { userId: user.id })).resolves.toBeUndefined();

    const apres = await currentPlacements(user.id);
    expect(apres.length).toBeGreaterThan(0);

    // Un replacement à l'identique n'est PAS un déplacement : il doit rester `scheduled`.
    const placesInchanges = apres.filter(
      (row) => row.scheduled_date !== null && row.scheduled_date === row.origin_date && row.scheduled_time === row.origin_time,
    );
    expect(placesInchanges.length).toBeGreaterThan(0);
    for (const row of placesInchanges) expect(row.status).toBe("scheduled");
  });

  /**
   * Couverture de CHEMIN, pas garde-fou de régression — et il faut le dire.
   *
   * Contrairement au test précédent, celui-ci passe AUSSI sans le correctif : je n'ai pas trouvé
   * de scénario déterministe où une résolution d'imprévu retombe sur son créneau d'origine (le
   * premier signalement écarte la séance, le second ne l'y ramène pas). Il exerce donc le chemin
   * et vérifie l'invariant, sans pouvoir prouver la régression.
   *
   * Le garde-fou précis de ce chemin vit au niveau du moteur, là où les deux appelants convergent :
   * `packages/rules-engine/src/__tests__/placement-origin-time-format.test.ts`.
   */
  it("aucun placement ne peut être 'moved' sans différer de son origine, après un signalement d'imprévu", async () => {
    const user = await createTestUser("incident-same-slot");
    users.push(user);
    const { objectiveId } = await seedAthleteAndObjective(admin, user.id);
    await seedAvailability(user.id);

    const now = AUJOURD_HUI;
    const plan = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
    if (plan.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${plan.outcome}'`);

    const placables = (await currentPlacements(user.id)).filter((row) => row.status !== "cancelled_week" && row.scheduled_date !== null);
    expect(placables.length).toBeGreaterThan(0);
    const cible = placables[0]!;

    // `resolveScheduleIncident()` relit `origin_*` depuis la base, exactement comme le job — c'est
    // le second des deux chemins jamais couverts.
    //
    // DEUX signalements successifs : le premier écarte la séance de son créneau d'origine, le
    // second la redécide alors que ce créneau d'origine est de nouveau libre. C'est le seul
    // scénario où ce chemin peut retomber sur son origine, donc le seul où il exposait la
    // violation de contrainte.
    const ruleset = await getActiveRuleset(admin);
    const premier = await resolveScheduleIncident(admin, {
      userId: user.id,
      plannedSessionId: cible.planned_session_id,
      now: { date: cible.scheduled_date!, time: "06:00" },
      ruleset,
    });
    expect(premier.kind).toBe("resolved");

    const apresPremier = (await currentPlacements(user.id)).find((row) => row.planned_session_id === cible.planned_session_id);
    expect(apresPremier).toBeDefined();

    if (apresPremier?.scheduled_date) {
      const second = await resolveScheduleIncident(admin, {
        userId: user.id,
        plannedSessionId: cible.planned_session_id,
        now: { date: apresPremier.scheduled_date, time: "06:00" },
        ruleset,
      });
      expect(["resolved", "already_resolved", "not_reportable"]).toContain(second.kind);
    }

    // L'invariant que la contrainte encode, vérifié applicativement : un `moved` qui n'a pas bougé
    // est précisément ce que le bug produisait.
    for (const row of await currentPlacements(user.id)) {
      if (row.status !== "moved") continue;
      expect(row.scheduled_date !== row.origin_date || row.scheduled_time !== row.origin_time).toBe(true);
    }
  });
});
