import { afterAll, describe, expect, it } from "vitest";

import { DeterministicMockLlmProvider } from "@hybride/coach-llm";

import { aggregateCompletedWeeks } from "@/lib/orchestration/aggregate-completed-weeks";
import { buildPlanningContext } from "@/lib/orchestration/build-planning-context";
import { getActiveRuleset } from "@/lib/orchestration/get-active-ruleset";
import { persistStagnationDiagnosis } from "@/lib/orchestration/persist-stagnation-diagnosis";
import { regeneratePlan } from "@/lib/orchestration/regenerate-plan";
import { createTestUser, deleteTestUser, seedAthleteAndObjective, serviceRoleClient, type TestUser } from "./support/test-clients";

/**
 * `progress-calibration.test.ts` (finding I13, `plans/US-01-...md` §4.3, AC6/AC7, finding I6) —
 * `persistStagnationDiagnosis()` est la fonction PARTAGÉE entre `runWeeklyReview()` et
 * `GET /api/v1/progress/diagnosis` (voir son en-tête) : ce dernier n'est pas exercé directement ici
 * (`requireUser()`/`next/headers`, hors de portée d'un test d'intégration Node — même contrainte que
 * `paywall.test.ts`), mais on reproduit ici la séquence EXACTE de la route pour deux « GET »
 * consécutifs le même jour (`buildPlanningContext` → `aggregateCompletedWeeks` → lecture d'un
 * diagnostic déjà persisté → `persistStagnationDiagnosis()` seulement s'il n'existe pas encore),
 * avec les deux garanties corrigées au finding I6 :
 *
 * 1. Idempotence réelle bout en bout (route + fonction partagée) : un second « GET » le même jour
 *    ne déclenche NI second appel LLM NI seconde écriture — la ligne déjà persistée est réutilisée.
 * 2. `explanations.subject_id` référence désormais la ligne `stagnation_diagnoses` RÉELLEMENT écrite
 *    (avant correction : `subject_id: randomUUID()`, une entité inexistante — bruit d'audit permanent).
 */
const admin = serviceRoleClient();

/** Reproduit la vérification d'existence de `readPersistedDiagnosis()` (route, non exportée) —
 * seul le prédicat d'idempotence nous intéresse ici (une ligne du jour existe déjà, oui/non). */
async function hasPersistedDiagnosisToday(userId: string, now: string): Promise<boolean> {
  const { data, error } = await admin.from("stagnation_diagnoses").select("id").eq("user_id", userId).eq("evaluated_on", now).maybeSingle();
  if (error) throw error;
  return data !== null;
}

describe("progress-calibration — AC6/AC7 (finding I6)", () => {
  let user: TestUser;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  it("un utilisateur tout juste onboardé (0 semaine complétée) reçoit un diagnostic 'calibration', persisté et idempotent sur deux GET consécutifs", async () => {
    user = await createTestUser("progress-calibration");
    const { objectiveId } = await seedAthleteAndObjective(admin, user.id);

    const now = "2026-08-10";
    const initial = await regeneratePlan(admin, { userId: user.id, objectiveId, trigger: "onboarding", now });
    if (initial.outcome !== "plan_generated") throw new Error(`[test] plan initial attendu 'plan_generated', obtenu '${initial.outcome}'`);

    const ruleset = await getActiveRuleset(admin);
    const llmProvider = new DeterministicMockLlmProvider();

    // Reproduit EXACTEMENT la séquence de `GET /api/v1/progress/diagnosis` (voir son en-tête) : la
    // route calcule `history.completedWeeks` ELLE-MÊME (`buildPlanningContext()` le laisse `[]`).
    const { context } = await buildPlanningContext(admin, { userId: user.id, now, trigger: "stagnation", objectiveId });
    const completedWeeks = aggregateCompletedWeeks(context.history);
    expect(completedWeeks).toHaveLength(0); // aucun `session_logs`/`nutrition_checkins` saisi.
    const contextWithWeeks = { ...context, history: { ...context.history, completedWeeks } };

    // --- 1er "GET" ---------------------------------------------------------------------------
    expect(await hasPersistedDiagnosisToday(user.id, now)).toBe(false);
    await persistStagnationDiagnosis(admin, { userId: user.id, now, ruleset, context: contextWithWeeks, llmProvider });

    const { data: rows, error } = await admin
      .from("stagnation_diagnoses")
      .select("id, status, weeks_available, explanation_id, evaluated_on")
      .eq("user_id", user.id)
      .eq("evaluated_on", now);
    if (error) throw error;
    expect(rows).toHaveLength(1);
    const diagnosisRow = rows![0]!;
    expect(diagnosisRow.status).toBe("calibration");
    expect(diagnosisRow.weeks_available).toBe(0);
    expect(diagnosisRow.explanation_id).not.toBeNull();

    // Finding I6 (2ᵉ point) — `explanations.subject_id` référence la ligne RÉELLEMENT écrite, plus
    // un `randomUUID()` orphelin.
    const { data: explanationRow, error: explanationError } = await admin
      .from("explanations")
      .select("subject_id, subject_type")
      .eq("id", diagnosisRow.explanation_id!)
      .single();
    if (explanationError) throw explanationError;
    expect(explanationRow.subject_type).toBe("stagnation_diagnosis");
    expect(explanationRow.subject_id).toBe(diagnosisRow.id);

    const { count: explanationsCountAfterFirst } = await admin
      .from("explanations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("subject_type", "stagnation_diagnosis");

    // --- 2ᵉ "GET", même jour (rafraîchissement de page) ---------------------------------------
    // La route sert le diagnostic déjà persisté SANS rappeler `persistStagnationDiagnosis()` — la
    // garantie testée ici est bien celle décrite par I6 : aucun second appel LLM, aucune seconde
    // écriture, quel que soit le nombre de rafraîchissements de la page le même jour.
    expect(await hasPersistedDiagnosisToday(user.id, now)).toBe(true);

    const { data: rowsAfter, error: rowsAfterError } = await admin
      .from("stagnation_diagnoses")
      .select("id")
      .eq("user_id", user.id)
      .eq("evaluated_on", now);
    if (rowsAfterError) throw rowsAfterError;
    expect(rowsAfter).toHaveLength(1);
    expect(rowsAfter![0]!.id).toBe(diagnosisRow.id);

    const { count: explanationsCountAfterSecond } = await admin
      .from("explanations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("subject_type", "stagnation_diagnosis");
    expect(explanationsCountAfterSecond).toBe(explanationsCountAfterFirst);
  });
});
