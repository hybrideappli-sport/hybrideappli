import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestUser, deleteTestUser, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `plan_versions`, `decision_traces`, `consents` portent un trigger
 * `forbid_mutation()` — UPDATE et DELETE doivent échouer, **y compris pour
 * le `service_role`** (08-architecture.md §5, règle non négociable §3 du
 * plan). On vérifie donc ici avec le client le plus privilégié possible :
 * si même lui ne peut pas muter ces tables, personne ne le peut.
 */
describe("immutability", () => {
  let user: TestUser;
  const admin = serviceRoleClient();

  beforeAll(async () => {
    user = await createTestUser("immutability");
  });

  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("consents : UPDATE et DELETE lèvent une exception (forbid_mutation)", async () => {
    const { data: consent, error: insertError } = await admin
      .from("consents")
      .insert({
        user_id: user.id,
        document_code: "medical_disclaimer",
        document_version: "1.0.0",
        granted: true,
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(consent).not.toBeNull();

    const { error: updateError } = await admin
      .from("consents")
      .update({ granted: false })
      .eq("id", consent!.id);
    expect(updateError, "UPDATE aurait dû être rejeté par forbid_mutation()").not.toBeNull();

    const { error: deleteError } = await admin.from("consents").delete().eq("id", consent!.id);
    expect(deleteError, "DELETE aurait dû être rejeté par forbid_mutation()").not.toBeNull();
  });

  it("decision_traces : UPDATE et DELETE lèvent une exception (forbid_mutation)", async () => {
    const { data: engineRun, error: engineRunError } = await admin
      .from("engine_runs")
      .insert({
        user_id: user.id,
        trigger: "onboarding",
        ruleset_version: "0.1.0-dev",
        input_snapshot_hash: "test-hash-decision-traces",
        status: "succeeded",
      })
      .select()
      .single();
    expect(engineRunError).toBeNull();

    const { data: trace, error: traceError } = await admin
      .from("decision_traces")
      .insert({
        user_id: user.id,
        engine_run_id: engineRun!.id,
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
    expect(traceError).toBeNull();

    const { error: updateError } = await admin
      .from("decision_traces")
      .update({ severity: "warning" })
      .eq("id", trace!.id);
    expect(updateError, "UPDATE aurait dû être rejeté par forbid_mutation()").not.toBeNull();

    const { error: deleteError } = await admin
      .from("decision_traces")
      .delete()
      .eq("id", trace!.id);
    expect(deleteError, "DELETE aurait dû être rejeté par forbid_mutation()").not.toBeNull();
  });

  it("plan_versions : UPDATE et DELETE lèvent une exception (forbid_mutation)", async () => {
    const { data: objective, error: objectiveError } = await admin
      .from("objectives")
      .insert({ user_id: user.id, kind: "general_fitness", label: "Test objective" })
      .select()
      .single();
    expect(objectiveError).toBeNull();

    const { data: plan, error: planError } = await admin
      .from("plans")
      .insert({
        user_id: user.id,
        objective_id: objective!.id,
        started_on: "2026-08-01",
      })
      .select()
      .single();
    expect(planError).toBeNull();

    const { data: engineRun, error: engineRunError } = await admin
      .from("engine_runs")
      .insert({
        user_id: user.id,
        trigger: "onboarding",
        ruleset_version: "0.1.0-dev",
        input_snapshot_hash: "test-hash-plan-versions",
        status: "succeeded",
      })
      .select()
      .single();
    expect(engineRunError).toBeNull();

    const { data: planVersion, error: planVersionError } = await admin
      .from("plan_versions")
      .insert({
        plan_id: plan!.id,
        user_id: user.id,
        version_number: 1,
        trigger: "onboarding",
        ruleset_version: "0.1.0-dev",
        engine_run_id: engineRun!.id,
        input_snapshot: {},
        input_snapshot_hash: "test-hash-plan-versions",
        snapshot: {},
        horizon_start: "2026-08-01",
        horizon_end: "2026-08-07",
      })
      .select()
      .single();
    expect(planVersionError).toBeNull();

    const { error: updateError } = await admin
      .from("plan_versions")
      .update({ is_weekly_baseline: true })
      .eq("id", planVersion!.id);
    expect(updateError, "UPDATE aurait dû être rejeté par forbid_mutation()").not.toBeNull();

    const { error: deleteError } = await admin
      .from("plan_versions")
      .delete()
      .eq("id", planVersion!.id);
    expect(deleteError, "DELETE aurait dû être rejeté par forbid_mutation()").not.toBeNull();
  });
});
