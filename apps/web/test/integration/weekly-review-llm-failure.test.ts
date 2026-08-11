import { afterAll, describe, expect, it, vi } from "vitest";

import { DeterministicMockLlmProvider, type LlmProvider } from "@hybride/coach-llm";

import { createTestUser, deleteTestUser, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `weekly-review-llm-failure.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC5, ADR-011 §4) —
 * comportement de `runWeeklyReview()` quand le fournisseur LLM échoue systématiquement (panne
 * réseau, timeout, clé invalide…) : le job dominical ne doit JAMAIS échouer pour ce seul motif — la
 * dégradation gracieuse est portée par `renderExplanation()` (`@hybride/coach-llm`, voir son
 * en-tête : « retombe SYSTÉMATIQUEMENT sur le template déterministe… le produit n'est donc jamais
 * bloqué par le LLM »). Ce test l'exerce à l'échelle de l'ORCHESTRATEUR complet (pas seulement de
 * `renderExplanation()` isolément, déjà couvert par les tests unitaires de `@hybride/coach-llm`) :
 * `plan_versions`, `plan_diffs` et la notification `weekly_review_ready` doivent tous être
 * matérialisés malgré la panne — « pas de perte de données côté job ».
 *
 * `getLlmProvider()` (`apps/web/lib/coach-llm-provider.ts`) est mocké via `vi.mock` — c'est le SEUL
 * point d'entrée du fournisseur LLM dans `apps/web` (voir son en-tête) : `runWeeklyReview()` ne
 * reçoit jamais de fournisseur en paramètre, il l'obtient lui-même via ce module.
 */

const { getLlmProviderMock } = vi.hoisted(() => ({ getLlmProviderMock: vi.fn() }));

vi.mock("@/lib/coach-llm-provider", () => ({ getLlmProvider: getLlmProviderMock }));

const { regeneratePlan } = await import("@/lib/orchestration/regenerate-plan");
const { runWeeklyReview } = await import("@/lib/orchestration/run-weekly-review");

/** Simule une panne totale du fournisseur — réseau, timeout, 5xx : peu importe la cause exacte,
 * `renderExplanation()` (`@hybride/coach-llm`) traite tout rejet de la même façon (`catch` générique). */
class AlwaysFailingLlmProvider implements LlmProvider {
  readonly name = "failing-test-provider";
  async converseOnboarding(): Promise<never> {
    throw new Error("[test] fournisseur LLM indisponible (onboarding).");
  }
  async renderExplanation(): Promise<never> {
    throw new Error("[test] fournisseur LLM indisponible (explication).");
  }
}

const workingProvider = new DeterministicMockLlmProvider();
const failingProvider = new AlwaysFailingLlmProvider();
getLlmProviderMock.mockImplementation(() => workingProvider);

const admin = serviceRoleClient();

describe("weekly-review-llm-failure — AC5, ADR-011 §4", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("le job hebdomadaire se termine normalement (repli template), sans aucune perte de données, même si le LLM échoue systématiquement", async () => {
    user = await createTestUser("weekly-review-llm-failure");
    const { objectiveId } = await seedAthleteAndObjective(admin, user.id);

    // Premier plan (onboarding) — fournisseur LLM FONCTIONNEL, pour isoler la panne au SEUL run de
    // révision hebdomadaire ci-dessous.
    const onboardingNow = "2026-08-10"; // lundi
    const initial = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now: onboardingNow });
    if (initial.outcome !== "plan_generated") throw new Error(`[test] premier plan attendu 'plan_generated', obtenu '${initial.outcome}'`);

    // Le run de révision hebdomadaire, lui, tombe sur un fournisseur qui échoue systématiquement.
    getLlmProviderMock.mockImplementationOnce(() => failingProvider);

    const reviewNow = "2026-08-16"; // dimanche suivant.
    const result = await runWeeklyReview(admin, { userId: user.id, now: reviewNow });

    // 1) Le job aboutit — jamais d'exception propagée pour cause de panne LLM.
    expect(result.outcome).toBe("reviewed");
    if (result.outcome !== "reviewed") return;

    // 2) Une nouvelle version de référence a bien été matérialisée (aucune perte de données).
    const { data: newVersion, error: versionError } = await admin
      .from("plan_versions")
      .select("id, trigger, is_weekly_baseline")
      .eq("id", result.planVersionId)
      .single();
    if (versionError) throw versionError;
    expect(newVersion.trigger).toBe("weekly_review");
    expect(newVersion.is_weekly_baseline).toBe(true);
    expect(newVersion.id).not.toBe(initial.planVersionId);

    // 3) Le diff hebdomadaire a bien été persisté.
    const { data: diffRow, error: diffError } = await admin.from("plan_diffs").select("id, to_version_id").eq("id", result.diffId).single();
    if (diffError) throw diffError;
    expect(diffRow.to_version_id).toBe(result.planVersionId);

    // 4) La notification dominicale reste garantie (canal `in_app` dur, ADR-011 §5) même si son
    // texte n'a pas pu être généré par le LLM.
    const { data: notifications, error: notificationsError } = await admin
      .from("notifications")
      .select("id, channel, body")
      .eq("user_id", user.id)
      .eq("type", "weekly_review_ready");
    if (notificationsError) throw notificationsError;
    expect(notifications!.length).toBeGreaterThan(0);
    expect(notifications!.some((n) => n.channel === "in_app")).toBe(true);
    for (const notification of notifications!) {
      expect(notification.body.length).toBeGreaterThan(0); // repli template, jamais un corps vide.
    }

    // 5) Le diagnostic de stagnation (AC6/AC7, partagé avec `GET /progress/diagnosis`) est lui
    // aussi persisté malgré la panne — pas seulement le plan.
    const { data: diagnosisRow, error: diagnosisError } = await admin
      .from("stagnation_diagnoses")
      .select("id, explanation_id")
      .eq("user_id", user.id)
      .eq("evaluated_on", reviewNow)
      .single();
    if (diagnosisError) throw diagnosisError;
    expect(diagnosisRow.explanation_id).not.toBeNull();

    // 6) Toutes les explications produites par CE run (résumé + diagnostic de stagnation) portent
    // la marque explicite du repli — jamais un texte silencieusement halluciné/vide, et jamais
    // `llm_model` pointant sur le fournisseur en panne (`renderExplanation()` catch générique,
    // `@hybride/coach-llm/src/explain.ts` : `llmModel: null` sur panne réseau).
    const explanationIds = [diagnosisRow.explanation_id!];
    const { data: diffItems, error: diffItemsError } = await admin.from("plan_diffs").select("summary_explanation_id").eq("id", result.diffId).single();
    if (diffItemsError) throw diffItemsError;
    if (diffItems.summary_explanation_id) explanationIds.push(diffItems.summary_explanation_id);

    const { data: explanationRows, error: explanationRowsError } = await admin
      .from("explanations")
      .select("id, generated_by, fallback_used, llm_model")
      .in("id", explanationIds);
    if (explanationRowsError) throw explanationRowsError;
    expect(explanationRows!.length).toBeGreaterThan(0);
    for (const explanation of explanationRows!) {
      expect(explanation.generated_by).toBe("template");
      expect(explanation.fallback_used).toBe(true);
      expect(explanation.llm_model).toBeNull();
    }
  });
});
