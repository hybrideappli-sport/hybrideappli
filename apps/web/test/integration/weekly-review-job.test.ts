import { afterAll, describe, expect, it } from "vitest";

import { isoWeekLabel } from "@/lib/dates";
import { enqueueWeeklyReviews } from "@/lib/jobs/enqueue-weekly-reviews";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { runWeeklyReview } from "@/lib/orchestration/run-weekly-review";
import { createTestUser, deleteTestUser, seedAthleteAndObjective, serviceRoleClient } from "./support/test-clients";

/**
 * `weekly-review-job.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC5) — « enrôlement dupliqué
 * ⟹ 1 seul job (clé d'idempotence) ; job produit version + diff + notification ».
 */
const admin = serviceRoleClient();

const user = await createTestUser("weekly-review-job");

afterAll(async () => {
  await deleteTestUser(user.id);
});

describe("weekly-review-job — enrôlement (idempotence)", () => {
  it("deux passages du cron pour le même dimanche 18h n'enrôlent qu'UN SEUL job (idempotency_key)", async () => {
    // Dimanche 2026-08-16, 19:30 UTC ⟹ 19:30 (UTC+2, DST) heure de Paris — `profiles.timezone`
    // vaut 'Europe/Paris' par défaut (`0002_identity_consents.sql`).
    const sundayEvening = new Date("2026-08-16T17:30:00Z");

    const first = await enqueueWeeklyReviews(admin, sundayEvening);
    const second = await enqueueWeeklyReviews(admin, sundayEvening);

    expect(first.scanned).toBeGreaterThan(0);
    // Le second passage ne peut plus enrôler CET utilisateur (déjà fait par le premier) — le
    // total peut inclure d'autres profils de fixtures encore présents, on vérifie donc la ligne
    // précise plutôt que le total agrégé.
    expect(second.scanned).toBeGreaterThan(0);

    const expectedIdempotencyKey = `weekly_review:${user.id}:${isoWeekLabel("2026-08-16")}`;
    const { data: jobs, error } = await admin.from("job_queue").select("id, idempotency_key, status").eq("idempotency_key", expectedIdempotencyKey);
    if (error) throw error;
    expect(jobs).toHaveLength(1);
  });

  it("hors du créneau dimanche 18h+, aucun enrôlement supplémentaire", async () => {
    const wednesdayMorning = new Date("2026-08-12T08:00:00Z");
    await enqueueWeeklyReviews(admin, wednesdayMorning);

    const { count, error } = await admin.from("job_queue").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "weekly_review");
    if (error) throw error;
    // Toujours 1 (le job du test précédent) — le passage de mercredi n'en ajoute aucun.
    expect(count).toBe(1);
  });
});

describe("weekly-review-job — exécution (runWeeklyReview)", () => {
  it("produit une nouvelle version de référence, un diff et une notification (AC5)", async () => {
    const { objectiveId } = await seedAthleteAndObjective(admin, user.id);

    const onboardingNow = "2026-08-10"; // lundi — premier plan (trigger 'onboarding').
    const initial = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now: onboardingNow });
    if (initial.outcome !== "plan_generated") {
      throw new Error(`[test] premier plan attendu 'plan_generated', obtenu '${initial.outcome}'`);
    }

    const reviewNow = "2026-08-16"; // dimanche suivant.
    const result = await runWeeklyReview(admin, { userId: user.id, now: reviewNow });
    expect(result.outcome).toBe("reviewed");
    if (result.outcome !== "reviewed") return;

    const { data: newVersion, error: versionError } = await admin
      .from("plan_versions")
      .select("id, trigger, is_weekly_baseline")
      .eq("id", result.planVersionId)
      .single();
    if (versionError) throw versionError;
    expect(newVersion.trigger).toBe("weekly_review");
    expect(newVersion.is_weekly_baseline).toBe(true);
    expect(newVersion.id).not.toBe(initial.planVersionId);

    const { data: diff, error: diffError } = await admin
      .from("plan_diffs")
      .select("id, to_version_id, from_version_id")
      .eq("to_version_id", result.planVersionId)
      .maybeSingle();
    if (diffError) throw diffError;
    expect(diff).not.toBeNull();

    const { data: notifications, error: notificationsError } = await admin
      .from("notifications")
      .select("id, type, channel")
      .eq("user_id", user.id)
      .eq("type", "weekly_review_ready");
    if (notificationsError) throw notificationsError;
    expect(notifications!.length).toBeGreaterThan(0);
    // La garantie dure (`08-architecture.md` §7) : le canal `in_app` est toujours écrit, push/e-mail
    // sont best-effort (voir `notify.ts`).
    expect(notifications!.some((n) => n.channel === "in_app")).toBe(true);
  });

  it("sans plan actif, sort proprement en 'no_active_plan' (jamais une erreur)", async () => {
    const other = await createTestUser("weekly-review-job-noplan");
    try {
      const result = await runWeeklyReview(admin, { userId: other.id, now: "2026-08-16" });
      expect(result.outcome).toBe("no_active_plan");
    } finally {
      await deleteTestUser(other.id);
    }
  });
});
