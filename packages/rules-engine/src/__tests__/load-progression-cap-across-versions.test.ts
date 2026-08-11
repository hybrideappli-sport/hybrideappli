/**
 * Test de non-régression — finding B2 (contre-revue post-correction, commit `1f2540d`).
 *
 * `1f2540d` a corrigé le fait que le plan restait gelé POUR TOUJOURS au volume de démarrage
 * prudent (`cold_start_volume_ratio` ne s'applique plus qu'à `previousPlan === null`), mais a, en
 * le faisant, supprimé le SEUL plafond qui bornait la progression de charge entre deux versions de
 * plan. `applyHardGuardrails` (étape 11) ne compare que la semaine `i` à la semaine `i-1` DU MÊME
 * brouillon (aucun antécédent pour la semaine d'index 0) ; l'étape 6 (`computeWeeklyLoadTarget`)
 * autorisait, pour `weekly_review`/`objective_renegotiation` sans signal négatif actif, une hausse
 * NON BORNÉE de la semaine 0 par rapport à la version précédente — mesuré empiriquement par la
 * contre-revue : +43 % (dataRegime toujours 'cold') à +165 % (dataRegime 'declared', historique
 * réel) d'une révision hebdomadaire à l'autre, alors que `weekly_load_progression_cap_pct` du
 * ruleset vaut 10 %.
 *
 * Ce fichier reproduit les deux scénarios chiffrés par la contre-revue (onboarding → weekly_review,
 * avec et sans historique réel loggé) et vérifie que la hausse de charge entre les deux versions de
 * plan respecte désormais `weekly_load_progression_cap_pct`, tout en vérifiant que :
 *  - la progression n'est PAS bloquée (pas de retour au bug d'origine : le plan gelé pour
 *    toujours) — seulement bornée ;
 *  - la baisse (trigger `negative_signal`/`pain_protocol`) reste, elle, non plafonnée (AC4) ;
 *  - `previousPlan === null` (tout premier plan) continue d'appliquer `cold_start_volume_ratio`
 *    normalement, sans qu'aucun plafond inter-version n'entre en jeu (rien à comparer).
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { RULE_IDS } from "../rule-ids";
import { addDays } from "../lib/dates";
import {
  FIXED_NOW,
  buildContext,
  buildPainEpisode,
  buildProfile,
  buildWeekAggregate,
} from "../../__fixtures__/planning-context";
import { GUARDRAILS_0_1_0_DEV, TEST_RULESET } from "../../__fixtures__/ruleset";

const CAP_PCT = GUARDRAILS_0_1_0_DEV.weekly_load_progression_cap_pct;

function maxAllowedAfter(before: number): number {
  return Math.round(before * (1 + CAP_PCT / 100));
}

describe("load-progression-cap-across-versions — finding B2 (non-régression)", () => {
  it("weekly_review, dataRegime toujours 'cold' (rien loggué) : la hausse de la semaine 0 respecte weekly_load_progression_cap_pct", () => {
    const onboardingContext = buildContext({
      trigger: "onboarding",
      dataRegime: "cold",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
    });
    const { plan: v1 } = generatePlan(onboardingContext, TEST_RULESET);
    const v1Week0 = v1.weeks[0]!;

    const weeklyReviewContext = buildContext({
      trigger: "weekly_review",
      dataRegime: "cold", // toujours rien loggué — c'est exactement le scénario mesuré par la contre-revue
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
      previousPlan: v1,
    });
    const { plan: v2, traces } = generatePlan(weeklyReviewContext, TEST_RULESET);
    const v2Week0 = v2.weeks[0]!;

    // Preuve que la régression est bien reproduite par ce montage : sans plafond, la baseline
    // recalculée (non réduite par cold_start_volume_ratio la deuxième fois) dépasse la borne de
    // +10 % — exactement le saut de +43 % rapporté par la contre-revue.
    expect(v2Week0.targetLoadUnits).toBeGreaterThan(v1Week0.targetLoadUnits);

    // Le cœur du correctif : la hausse réelle reste bornée par weekly_load_progression_cap_pct.
    expect(v2Week0.targetLoadUnits).toBeLessThanOrEqual(maxAllowedAfter(v1Week0.targetLoadUnits));

    // Pas de gel : la progression a réellement eu lieu, ce n'est pas le bug d'origine qui revient.
    const growthPct = ((v2Week0.targetLoadUnits - v1Week0.targetLoadUnits) / v1Week0.targetLoadUnits) * 100;
    expect(growthPct).toBeGreaterThan(0);
    expect(growthPct).toBeLessThanOrEqual(CAP_PCT + 1e-6);

    expect(traces.some((t) => t.ruleId === RULE_IDS.weeklyLoadCapAppliedAcrossVersions)).toBe(true);
  });

  it("weekly_review, dataRegime='declared' avec historique réel loggé : la hausse reste plafonnée malgré une baseline très supérieure (scénario +165 % de la contre-revue)", () => {
    const onboardingContext = buildContext({
      trigger: "onboarding",
      dataRegime: "cold",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
    });
    const { plan: v1 } = generatePlan(onboardingContext, TEST_RULESET);
    const v1Week0 = v1.weeks[0]!;

    // Historique réel des 4 dernières semaines, à une charge nettement plus haute que le volume
    // de démarrage prudent de v1 — c'est précisément ce différentiel qui, sans plafond
    // inter-version, produisait le saut de +165 % rapporté par la contre-revue.
    const completedWeeks = [0, 1, 2, 3].map((i) =>
      buildWeekAggregate({ weekStart: addDays(FIXED_NOW, -7 * (4 - i)), totalLoadUnits: 900 + i * 10 }),
    );

    const weeklyReviewContext = buildContext({
      trigger: "weekly_review",
      dataRegime: "declared",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
      history: { sessionLogs: [], nutritionCheckins: [], bodyMetrics: [], completedWeeks },
      previousPlan: v1,
    });
    const { plan: v2, traces } = generatePlan(weeklyReviewContext, TEST_RULESET);
    const v2Week0 = v2.weeks[0]!;

    const uncappedGrowthPct = ((900 - v1Week0.targetLoadUnits) / v1Week0.targetLoadUnits) * 100;
    expect(uncappedGrowthPct).toBeGreaterThan(CAP_PCT); // la baseline brute dépasse largement le plafond

    expect(v2Week0.targetLoadUnits).toBeGreaterThan(v1Week0.targetLoadUnits); // progression réelle
    expect(v2Week0.targetLoadUnits).toBeLessThanOrEqual(maxAllowedAfter(v1Week0.targetLoadUnits)); // mais bornée

    expect(traces.some((t) => t.ruleId === RULE_IDS.weeklyLoadCapAppliedAcrossVersions)).toBe(true);
  });

  it("negative_signal avec douleur active : la BAISSE immédiate n'est jamais plafonnée (seule la hausse l'est, AC4)", () => {
    const onboardingContext = buildContext({
      trigger: "onboarding",
      dataRegime: "declared",
      profile: buildProfile({ declaredWeeklyHours: 10, declaredWeeklySessions: 6 }),
      history: {
        sessionLogs: [],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [0, 1, 2, 3].map((i) => buildWeekAggregate({ weekStart: addDays(FIXED_NOW, -7 * (4 - i)), totalLoadUnits: 900 })),
      },
    });
    const { plan: v1 } = generatePlan(onboardingContext, TEST_RULESET);
    const v1Week0 = v1.weeks[0]!;

    const negativeSignalContext = buildContext({
      trigger: "negative_signal",
      dataRegime: "declared",
      profile: buildProfile({ declaredWeeklyHours: 10, declaredWeeklySessions: 6 }),
      previousPlan: v1,
      painEpisodes: [buildPainEpisode({ level: "persistent", resolvedAt: null, lastSignalOn: FIXED_NOW })],
    });
    const { plan: v2 } = generatePlan(negativeSignalContext, TEST_RULESET);
    const v2Week0 = v2.weeks[0]!;

    expect(v2Week0.targetLoadUnits).toBeLessThan(v1Week0.targetLoadUnits);
    // La baisse dépasse largement ce que le plafond de HAUSSE aurait autorisé dans l'autre sens —
    // preuve que ce chemin n'est pas contraint par `weekly_load_progression_cap_pct`.
    const dropPct = ((v1Week0.targetLoadUnits - v2Week0.targetLoadUnits) / v1Week0.targetLoadUnits) * 100;
    expect(dropPct).toBeGreaterThan(CAP_PCT);
  });

  it("previousPlan === null (tout premier plan) : cold_start_volume_ratio s'applique normalement, sans plafond inter-version (rien à comparer)", () => {
    const context = buildContext({
      trigger: "onboarding",
      dataRegime: "cold",
      profile: buildProfile({ declaredWeeklyHours: 8, declaredWeeklySessions: 5 }),
      previousPlan: null,
    });
    const { plan, traces } = generatePlan(context, TEST_RULESET);

    expect(traces.some((t) => t.ruleId === RULE_IDS.coldStart)).toBe(true);
    expect(traces.some((t) => t.ruleId === RULE_IDS.weeklyLoadCapAppliedAcrossVersions)).toBe(false);

    const declaredWeeklyLoadUnitsApprox = 8 * 36;
    expect(plan.weeks[0]!.targetLoadUnits).toBe(
      Math.round(declaredWeeklyLoadUnitsApprox * TEST_RULESET.params.guardrails.cold_start_volume_ratio!),
    );
  });
});
