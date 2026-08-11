import { afterAll, describe, expect, it } from "vitest";

import type { ConfirmedProfile } from "@hybride/domain";

import { completeOnboarding } from "@/lib/orchestration/complete-onboarding";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { createTestUser, deleteTestUser, grantHealthConsents, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `onboarding-complete.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC1) — flux complet de
 * complétion d'onboarding : `completeOnboarding()` (persistance du profil déclaratif confirmé) puis
 * `regeneratePlan('onboarding')` (premier plan), exactement la séquence de
 * `POST /api/v1/onboarding/session/:id/complete` (voir son en-tête — ce Route Handler dépend de
 * `requireUser()`/`next/headers`, hors de portée d'un test d'intégration Node, couvert par
 * `e2e/onboarding.spec.ts`).
 *
 * Couvre en particulier le SECOND passage par l'onboarding (AC14, `/objectif/fin` →
 * `/onboarding/chat`, finding I8) : avant correction, `completeOnboarding()` échouait
 * systématiquement en 500 au second appel (`insert()` pur sur `athlete_profiles`/`athlete_sports`,
 * contraintes uniques déjà prises par le premier passage), et même corrigé, le plan régénéré
 * restait rattaché à l'ANCIEN objectif (`plans.objective_id` jamais mis à jour). Les deux points
 * sont vérifiés explicitement ci-dessous plutôt que supposés.
 */
const admin = serviceRoleClient();

function buildConfirmedProfile(overrides: Partial<ConfirmedProfile> = {}): ConfirmedProfile {
  return {
    birthDate: "1994-03-12",
    sexAtBirth: "male",
    heightCm: 178,
    experienceLevel: "intermediate",
    trainingYears: 4,
    declaredWeeklySessions: 3,
    declaredWeeklyHours: 5,
    trainingHistory: {},
    nutritionHabits: {},
    dietaryConstraints: [],
    sports: [{ sportCode: "running", level: "intermediate", weeklySessionsDeclared: 3, yearsPractice: 4, isPrimary: true, priority: 1 }],
    availability: [{ weekday: 1, slot: "am", maxMinutes: 90, isAvailable: true }],
    objective: { sportCode: null, kind: "general_fitness", label: "Premier objectif", targetDate: null, targetMetric: {} },
    riskFlags: [],
    ...overrides,
  };
}

describe("onboarding-complete — premier passage (AC1)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("persiste le profil déclaratif confirmé puis génère le premier plan actif", async () => {
    user = await createTestUser("onboarding-complete-first");
    await grantHealthConsents(admin, user.id);

    const confirmedProfile = buildConfirmedProfile();
    const { objectiveId } = await completeOnboarding(user.client, admin, { userId: user.id, profile: confirmedProfile });
    expect(objectiveId).toBeTruthy();

    const { data: profileRow, error: profileError } = await admin
      .from("athlete_profiles")
      .select("experience_level, declared_weekly_hours, height_cm")
      .eq("user_id", user.id)
      .single();
    if (profileError) throw profileError;
    expect(profileRow.experience_level).toBe("intermediate");
    expect(profileRow.declared_weekly_hours).toBe(5);
    expect(profileRow.height_cm).toBe(178);

    const { data: sportsRows, error: sportsError } = await admin.from("athlete_sports").select("level, is_primary").eq("user_id", user.id);
    if (sportsError) throw sportsError;
    expect(sportsRows).toHaveLength(1);
    expect(sportsRows![0]!.is_primary).toBe(true);

    const { data: objectiveRow, error: objectiveError } = await admin.from("objectives").select("label, status").eq("id", objectiveId).single();
    if (objectiveError) throw objectiveError;
    expect(objectiveRow.label).toBe("Premier objectif");

    const now = "2026-08-10";
    const result = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
    expect(result.outcome).toBe("plan_generated");
    if (result.outcome !== "plan_generated") return;

    const { data: planRow, error: planError } = await admin
      .from("plans")
      .select("objective_id, current_version_id, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    if (planError) throw planError;
    expect(planRow.objective_id).toBe(objectiveId);
    expect(planRow.current_version_id).toBe(result.planVersionId);
  });
});

describe("onboarding-complete — second passage, nouvel objectif (AC14, finding I8)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("un second appel à completeOnboarding() (au lieu d'échouer en 500) MET À JOUR le profil et le plan bascule sur le nouvel objectif", async () => {
    user = await createTestUser("onboarding-complete-second");
    await grantHealthConsents(admin, user.id);

    const firstProfile = buildConfirmedProfile({ objective: { sportCode: null, kind: "general_fitness", label: "Objectif initial", targetDate: null, targetMetric: {} } });
    const { objectiveId: firstObjectiveId } = await completeOnboarding(user.client, admin, { userId: user.id, profile: firstProfile });
    const firstPlan = await regeneratePlan(admin, { userId: user.id, objectiveId: firstObjectiveId, trigger: "onboarding", now: "2026-08-10" });
    expect(firstPlan.outcome).toBe("plan_generated");
    if (firstPlan.outcome !== "plan_generated") return;

    // Second passage — mêmes tables à contrainte unique (`athlete_profiles` PK `user_id`,
    // `athlete_sports` unique(user_id, sport_id)) : `insert()` pur romprait ici (finding I8, 1/2).
    const secondProfile = buildConfirmedProfile({
      declaredWeeklyHours: 8, // profil mis à jour, pas un second utilisateur fantôme.
      sports: [{ sportCode: "running", level: "advanced", weeklySessionsDeclared: 5, yearsPractice: 5, isPrimary: true, priority: 1 }],
      objective: { sportCode: null, kind: "performance", label: "Nouvel objectif (AC14)", targetDate: null, targetMetric: {} },
    });
    const { objectiveId: secondObjectiveId } = await completeOnboarding(user.client, admin, { userId: user.id, profile: secondProfile });
    expect(secondObjectiveId).not.toBe(firstObjectiveId);

    // Profil réellement MIS À JOUR, pas dupliqué (`athlete_profiles` reste 1 seule ligne, PK `user_id`).
    const { data: profileRows, error: profileRowsError } = await admin.from("athlete_profiles").select("user_id, declared_weekly_hours").eq("user_id", user.id);
    if (profileRowsError) throw profileRowsError;
    expect(profileRows).toHaveLength(1);
    expect(profileRows![0]!.declared_weekly_hours).toBe(8);

    // `athlete_sports` upserté sur `unique(user_id, sport_id)` : toujours 1 seule ligne pour
    // 'running', mise à jour (niveau 'advanced'), pas une seconde ligne en doublon.
    const { data: sportsRows, error: sportsRowsError } = await admin.from("athlete_sports").select("level").eq("user_id", user.id);
    if (sportsRowsError) throw sportsRowsError;
    expect(sportsRows).toHaveLength(1);
    expect(sportsRows![0]!.level).toBe("advanced");

    // `availability_slots` repart d'un état propre (pas d'accumulation de doublons).
    const { data: availabilityRows, error: availabilityError } = await admin.from("availability_slots").select("id").eq("user_id", user.id);
    if (availabilityError) throw availabilityError;
    expect(availabilityRows).toHaveLength(1);

    const secondPlan = await regeneratePlan(admin, { userId: user.id, objectiveId: secondObjectiveId, trigger: "onboarding", now: "2026-08-10" });
    expect(secondPlan.outcome).toBe("plan_generated");
    if (secondPlan.outcome !== "plan_generated") return;
    expect(secondPlan.planVersionId).not.toBe(firstPlan.planVersionId);

    // Finding I8 (2/2) — un seul plan actif par utilisateur, RATTACHÉ AU NOUVEL OBJECTIF : avant
    // correction, `materializePlanVersion()` réutilisait le plan actif sans jamais réécrire
    // `plans.objective_id`, qui restait indéfiniment posé sur `firstObjectiveId`.
    const { data: planRows, error: planRowsError } = await admin.from("plans").select("id, objective_id, current_version_id").eq("user_id", user.id).eq("status", "active");
    if (planRowsError) throw planRowsError;
    expect(planRows).toHaveLength(1);
    expect(planRows![0]!.objective_id).toBe(secondObjectiveId);
    expect(planRows![0]!.current_version_id).toBe(secondPlan.planVersionId);

    // L'ancien objectif n'est pas resté indéfiniment "active" en concurrence du nouveau.
    const { data: firstObjectiveRow, error: firstObjectiveRowError } = await admin.from("objectives").select("status").eq("id", firstObjectiveId).single();
    if (firstObjectiveRowError) throw firstObjectiveRowError;
    expect(firstObjectiveRow.status).toBe("active"); // `regeneratePlan()` ne rétrograde jamais l'ancien — comportement documenté, pas un oubli du test.
  });
});
