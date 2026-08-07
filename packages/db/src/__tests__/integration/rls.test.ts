import { afterAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient } from "./support/test-clients";
import type { Database } from "../../types";

type TableName = keyof Database["public"]["Tables"];

/**
 * Pour chaque table concernée : l'utilisateur A ne lit ni n'écrit aucune
 * ligne de B (règle non négociable, `plan` §4.3 / `08-architecture.md` §8).
 *
 * Stratégie : deux utilisateurs réels (A, B) authentifiés via Supabase Auth
 * (clé anon + session, comme un vrai client) ; un graphe de fixtures complet
 * est seedé pour A via `service_role` (qui contourne RLS, donc ne prouve
 * rien par lui-même — il ne sert qu'à peupler les données) ; puis chaque
 * assertion interroge les tables avec les clients authentifiés de A et B.
 */

const admin = serviceRoleClient();

const userA = await createTestUser("rls-a");
const userB = await createTestUser("rls-b");

afterAll(async () => {
  await deleteTestUser(userA.id);
  await deleteTestUser(userB.id);
});

// --- Graphe de fixtures, seedé pour A uniquement (service_role) -----------

const { data: sport, error: sportError } = await admin
  .from("sports")
  .select("id")
  .eq("code", "running")
  .single();
if (sportError || !sport) {
  throw new Error(
    `[test] référentiel sports inaccessible ou vide (migration 0010 a-t-elle tourné ?) : ${sportError?.message}`,
  );
}

const { data: profileA, error: profileAErr } = await admin
  .from("profiles")
  .insert({ id: userA.id })
  .select()
  .single();
if (profileAErr) throw profileAErr;

const { data: objectiveA, error: objectiveAErr } = await admin
  .from("objectives")
  .insert({ user_id: userA.id, kind: "general_fitness", label: "Fixture objective" })
  .select()
  .single();
if (objectiveAErr) throw objectiveAErr;

const { data: planA, error: planAErr } = await admin
  .from("plans")
  .insert({ user_id: userA.id, objective_id: objectiveA.id, started_on: "2026-08-01" })
  .select()
  .single();
if (planAErr) throw planAErr;

const { data: engineRunA, error: engineRunAErr } = await admin
  .from("engine_runs")
  .insert({
    user_id: userA.id,
    trigger: "onboarding",
    ruleset_version: "0.1.0-dev",
    input_snapshot_hash: "rls-fixture",
    status: "succeeded",
  })
  .select()
  .single();
if (engineRunAErr) throw engineRunAErr;

const { data: planVersionA, error: planVersionAErr } = await admin
  .from("plan_versions")
  .insert({
    plan_id: planA.id,
    user_id: userA.id,
    version_number: 1,
    trigger: "onboarding",
    ruleset_version: "0.1.0-dev",
    engine_run_id: engineRunA.id,
    input_snapshot: {},
    input_snapshot_hash: "rls-fixture",
    snapshot: {},
    horizon_start: "2026-08-01",
    horizon_end: "2026-08-07",
  })
  .select()
  .single();
if (planVersionAErr) throw planVersionAErr;

const { data: planBlockA, error: planBlockAErr } = await admin
  .from("plan_blocks")
  .insert({
    plan_version_id: planVersionA.id,
    user_id: userA.id,
    block_index: 1,
    block_type: "base",
    start_date: "2026-08-01",
    end_date: "2026-08-28",
  })
  .select()
  .single();
if (planBlockAErr) throw planBlockAErr;

const { data: planWeekA, error: planWeekAErr } = await admin
  .from("plan_weeks")
  .insert({
    plan_version_id: planVersionA.id,
    plan_block_id: planBlockA.id,
    user_id: userA.id,
    week_start: "2026-08-03",
    iso_week: "2026-W32",
    detail_level: "detailed",
    target_load_units: 100,
  })
  .select()
  .single();
if (planWeekAErr) throw planWeekAErr;

const { data: plannedSessionA, error: plannedSessionAErr } = await admin
  .from("planned_sessions")
  .insert({
    plan_version_id: planVersionA.id,
    plan_week_id: planWeekA.id,
    user_id: userA.id,
    sport_id: sport.id,
    scheduled_date: "2026-08-03",
    session_type: "endurance",
    detail_level: "detailed",
    load_units: 50,
  })
  .select()
  .single();
if (plannedSessionAErr) throw plannedSessionAErr;

const { data: nutritionDayA, error: nutritionDayAErr } = await admin
  .from("nutrition_days")
  .insert({
    plan_version_id: planVersionA.id,
    plan_week_id: planWeekA.id,
    user_id: userA.id,
    date: "2026-08-03",
    modulation_reason: "rest",
    kcal_target: 2000,
    kcal_safety_floor: 1500,
    protein_g: 120,
    carbs_g: 200,
    fat_g: 60,
  })
  .select()
  .single();
if (nutritionDayAErr) throw nutritionDayAErr;

const { data: planDiffA, error: planDiffAErr } = await admin
  .from("plan_diffs")
  .insert({ user_id: userA.id, plan_id: planA.id, to_version_id: planVersionA.id, items: [] })
  .select()
  .single();
if (planDiffAErr) throw planDiffAErr;

const { data: decisionTraceA, error: decisionTraceAErr } = await admin
  .from("decision_traces")
  .insert({
    user_id: userA.id,
    engine_run_id: engineRunA.id,
    ruleset_version: "0.1.0-dev",
    rule_id: "test.rule",
    rule_version: "1",
    category: "guardrail",
    scope: "plan",
    condition_expr: "true",
    inputs_used: [],
    output: {},
  })
  .select()
  .single();
if (decisionTraceAErr) throw decisionTraceAErr;

const { data: explanationA, error: explanationAErr } = await admin
  .from("explanations")
  .insert({
    user_id: userA.id,
    subject_type: "planned_session",
    subject_id: plannedSessionA.id,
    short_text: "Fixture explanation.",
    generated_by: "template",
    decision_trace_ids: [decisionTraceA.id],
  })
  .select()
  .single();
if (explanationAErr) throw explanationAErr;

const { data: painEpisodeA, error: painEpisodeAErr } = await admin
  .from("pain_episodes")
  .insert({
    user_id: userA.id,
    zone: "knee",
    level: "light",
    first_signal_on: "2026-08-03",
    last_signal_on: "2026-08-03",
  })
  .select()
  .single();
if (painEpisodeAErr) throw painEpisodeAErr;

const { data: stagnationA, error: stagnationAErr } = await admin
  .from("stagnation_diagnoses")
  .insert({
    user_id: userA.id,
    evaluated_on: "2026-08-03",
    window_start: "2026-07-06",
    window_end: "2026-08-03",
    weeks_available: 4,
    status: "calibration",
  })
  .select()
  .single();
if (stagnationAErr) throw stagnationAErr;

const { data: freeAccessA, error: freeAccessAErr } = await admin
  .from("free_access_events")
  .insert({ user_id: userA.id, accessed_on: "2026-08-03", surface: "dashboard" })
  .select()
  .single();
if (freeAccessAErr) throw freeAccessAErr;

const { data: subscriptionA, error: subscriptionAErr } = await admin
  .from("subscriptions")
  .insert({ user_id: userA.id })
  .select()
  .single();
if (subscriptionAErr) throw subscriptionAErr;

const { data: onboardingSessionA, error: onboardingSessionAErr } = await admin
  .from("onboarding_sessions")
  .insert({ user_id: userA.id })
  .select()
  .single();
if (onboardingSessionAErr) throw onboardingSessionAErr;

const { data: onboardingMessageA, error: onboardingMessageAErr } = await admin
  .from("onboarding_messages")
  .insert({ session_id: onboardingSessionA.id, user_id: userA.id, role: "coach", content: "Bonjour" })
  .select()
  .single();
if (onboardingMessageAErr) throw onboardingMessageAErr;

const { data: riskFlagA, error: riskFlagAErr } = await admin
  .from("risk_flags")
  .insert({ user_id: userA.id, flag_type: "other" })
  .select()
  .single();
if (riskFlagAErr) throw riskFlagAErr;

const { data: athleteProfileA, error: athleteProfileAErr } = await admin
  .from("athlete_profiles")
  .insert({ user_id: userA.id, experience_level: "beginner" })
  .select()
  .single();
if (athleteProfileAErr) throw athleteProfileAErr;

const { data: athleteSportA, error: athleteSportAErr } = await admin
  .from("athlete_sports")
  .insert({ user_id: userA.id, sport_id: sport.id, level: "intermediate" })
  .select()
  .single();
if (athleteSportAErr) throw athleteSportAErr;

const { data: availabilitySlotA, error: availabilitySlotAErr } = await admin
  .from("availability_slots")
  .insert({ user_id: userA.id, weekday: 1 })
  .select()
  .single();
if (availabilitySlotAErr) throw availabilitySlotAErr;

const { data: sessionLogA, error: sessionLogAErr } = await admin
  .from("session_logs")
  .insert({ user_id: userA.id, logged_date: "2026-08-03", completion: "done" })
  .select()
  .single();
if (sessionLogAErr) throw sessionLogAErr;

const { data: nutritionCheckinA, error: nutritionCheckinAErr } = await admin
  .from("nutrition_checkins")
  .insert({ user_id: userA.id, date: "2026-08-03", adherence: "high", energy: 3 })
  .select()
  .single();
if (nutritionCheckinAErr) throw nutritionCheckinAErr;

const { data: bodyMetricA, error: bodyMetricAErr } = await admin
  .from("body_metrics")
  .insert({ user_id: userA.id, measured_on: "2026-08-03", weight_kg: 70 })
  .select()
  .single();
if (bodyMetricAErr) throw bodyMetricAErr;

const { data: pushSubA, error: pushSubAErr } = await admin
  .from("push_subscriptions")
  // `endpoint` porte une contrainte UNIQUE globale (pas seulement par utilisateur) : on la
  // randomise pour ne jamais entrer en collision avec une exécution précédente de la suite,
  // y compris si le nettoyage `afterAll` d'un run interrompu n'a pas pu s'exécuter.
  .insert({
    user_id: userA.id,
    endpoint: `https://example.test/push/${userA.id}`,
    p256dh: "x",
    auth: "y",
  })
  .select()
  .single();
if (pushSubAErr) throw pushSubAErr;

const { data: consentA, error: consentAErr } = await admin
  .from("consents")
  .insert({ user_id: userA.id, document_code: "medical_disclaimer", document_version: "1.0.0", granted: true })
  .select()
  .single();
if (consentAErr) throw consentAErr;

const { data: notificationA, error: notificationAErr } = await admin
  .from("notifications")
  .insert({ user_id: userA.id, type: "weekly_review_ready", channel: "in_app", title: "t", body: "b" })
  .select()
  .single();
if (notificationAErr) throw notificationAErr;

// --- Cas d'isolation : { table, colonne de filtrage, valeur } -------------

type OwnershipCase = { table: TableName; column: string; value: string };

const ownershipCases: OwnershipCase[] = [
  { table: "profiles", column: "id", value: profileA.id },
  { table: "objectives", column: "id", value: objectiveA.id },
  { table: "plans", column: "id", value: planA.id },
  { table: "plan_versions", column: "id", value: planVersionA.id },
  { table: "plan_blocks", column: "id", value: planBlockA.id },
  { table: "plan_weeks", column: "id", value: planWeekA.id },
  { table: "planned_sessions", column: "id", value: plannedSessionA.id },
  { table: "nutrition_days", column: "id", value: nutritionDayA.id },
  { table: "plan_diffs", column: "id", value: planDiffA.id },
  { table: "decision_traces", column: "id", value: decisionTraceA.id },
  { table: "explanations", column: "id", value: explanationA.id },
  { table: "engine_runs", column: "id", value: engineRunA.id },
  { table: "pain_episodes", column: "id", value: painEpisodeA.id },
  { table: "stagnation_diagnoses", column: "id", value: stagnationA.id },
  { table: "free_access_events", column: "id", value: freeAccessA.id },
  { table: "subscriptions", column: "user_id", value: subscriptionA.user_id },
  { table: "onboarding_sessions", column: "id", value: onboardingSessionA.id },
  { table: "onboarding_messages", column: "id", value: onboardingMessageA.id },
  { table: "risk_flags", column: "id", value: riskFlagA.id },
  { table: "athlete_profiles", column: "user_id", value: athleteProfileA.user_id },
  { table: "athlete_sports", column: "id", value: athleteSportA.id },
  { table: "availability_slots", column: "id", value: availabilitySlotA.id },
  { table: "session_logs", column: "id", value: sessionLogA.id },
  { table: "nutrition_checkins", column: "id", value: nutritionCheckinA.id },
  { table: "body_metrics", column: "id", value: bodyMetricA.id },
  { table: "push_subscriptions", column: "id", value: pushSubA.id },
  { table: "consents", column: "id", value: consentA.id },
  { table: "notifications", column: "id", value: notificationA.id },
];

describe("rls — isolation entre utilisateurs", () => {
  for (const { table, column, value } of ownershipCases) {
    it(`${table} : A voit sa ligne, B ne la voit pas`, async () => {
      const asOwner = await userA.client.from(table).select(column).eq(column, value);
      expect(asOwner.error, `${table} (A) : ${asOwner.error?.message}`).toBeNull();
      expect(asOwner.data?.length ?? 0, `${table} : A devrait voir sa propre ligne`).toBeGreaterThan(0);

      const asOther = await userB.client.from(table).select(column).eq(column, value);
      expect(asOther.error, `${table} (B) : ${asOther.error?.message}`).toBeNull();
      expect(asOther.data ?? [], `${table} : B ne devrait voir aucune ligne de A`).toEqual([]);
    });
  }

  it("tables service_role strictes (stripe_events, job_queue) : invisibles pour tout utilisateur authentifié", async () => {
    for (const table of ["stripe_events", "job_queue"] as const) {
      const asA = await userA.client.from(table).select("*");
      expect(asA.error, `${table} : ${asA.error?.message}`).toBeNull();
      expect(asA.data ?? []).toEqual([]);
    }
  });

  it("plan_reviews : invisible pour un utilisateur non-staff, quelle que soit la ligne", async () => {
    const { data: review, error: reviewError } = await admin
      .from("plan_reviews")
      .insert({ plan_version_id: planVersionA.id, reviewer_id: userA.id })
      .select()
      .single();
    expect(reviewError).toBeNull();

    const asA = await userA.client.from("plan_reviews").select("id").eq("id", review!.id);
    expect(asA.error).toBeNull();
    expect(asA.data ?? [], "un utilisateur non-staff ne doit jamais voir plan_reviews").toEqual([]);
  });

  it("référentiels partagés (sports, consent_documents, rulesets) : lisibles par tout utilisateur authentifié", async () => {
    for (const table of ["sports", "consent_documents", "rulesets"] as const) {
      const asA = await userA.client.from(table).select("*").limit(1);
      const asB = await userB.client.from(table).select("*").limit(1);
      expect(asA.error, `${table} (A) : ${asA.error?.message}`).toBeNull();
      expect(asB.error, `${table} (B) : ${asB.error?.message}`).toBeNull();
      expect(asA.data?.length ?? 0).toBeGreaterThan(0);
      expect(asB.data?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("rls — écriture : B ne peut jamais écrire pour A", () => {
  it("B ne peut pas insérer une ligne session_logs avec user_id = A", async () => {
    const { error } = await userB.client
      .from("session_logs")
      .insert({ user_id: userA.id, logged_date: "2026-08-04", completion: "done" });
    expect(error, "l'insertion aurait dû être rejetée par la policy with check").not.toBeNull();
  });

  it("B ne peut pas insérer une ligne athlete_sports avec user_id = A", async () => {
    const { error } = await userB.client
      .from("athlete_sports")
      .insert({ user_id: userA.id, sport_id: sport.id, level: "beginner" });
    expect(error, "l'insertion aurait dû être rejetée par la policy with check").not.toBeNull();
  });

  it("B peut insérer sa propre ligne availability_slots (contrôle positif)", async () => {
    const { error } = await userB.client
      .from("availability_slots")
      .insert({ user_id: userB.id, weekday: 2 });
    expect(error, `B aurait dû pouvoir écrire sa propre ligne : ${error?.message}`).toBeNull();
  });

  it("B ne peut pas mettre à jour la ligne notifications de A", async () => {
    const { error, count } = await userB.client
      .from("notifications")
      .update({ read_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", notificationA.id);
    // RLS filtre la ligne cible : soit une erreur, soit 0 ligne affectée — jamais un succès sur la ligne de A.
    expect(error === null ? count : 0, "aucune ligne de A ne doit être modifiable par B").not.toBeGreaterThan(0);
  });
});
