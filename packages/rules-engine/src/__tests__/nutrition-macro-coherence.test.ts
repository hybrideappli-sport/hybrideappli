/**
 * AC11 — cohérence entre les macros affichées et la cible calorique qu'elles composent.
 *
 * Ce fichier existe à cause d'une incohérence qui a vécu jusqu'au 2026-09-10 sans qu'aucun test ne
 * la voie. La constante de maintenance du moteur valait 31 kcal/kg/j ; pour 70 kg un jour
 * `intensity`, protéines et glucides consommaient à eux seuls 2 212 kcal pour une cible de 2 210.
 * Le budget lipides devenait négatif, les lipides tombaient sur leur plancher, et le total des
 * macros affiché dépassait la cible de 14 %. Rien n'échouait : chaque valeur prise isolément était
 * plausible, et aucun test ne regardait leur SOMME.
 *
 * L'invariant verrouillé ici est celui qu'un utilisateur peut vérifier lui-même avec une
 * calculatrice, et c'est ce qui le rend important : `protéines × 4 + glucides × 4 + lipides × 9`
 * ne doit jamais dépasser `kcal_target`. Un plan qui affiche des macros dont la somme contredit sa
 * propre cible est faux à l'écran, pas seulement en interne.
 */

import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { buildContext, buildProfile } from "../../__fixtures__/planning-context";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

/** Tolérance d'arrondi : chaque macro est arrondie au gramme, soit au pire 9 kcal par poste. */
const ROUNDING_TOLERANCE_KCAL = 30;

function macroKcal(day: { proteinG: number; carbsG: number; fatG: number }): number {
  return day.proteinG * KCAL_PER_G_PROTEIN + day.carbsG * KCAL_PER_G_CARB + day.fatG * KCAL_PER_G_FAT;
}

/** Profils couvrant les trois modulations et les deux extrêmes de poids plausibles. */
const PROFILES = [
  { label: "volume faible (2 séances)", hours: 2, sessions: 2 },
  { label: "volume nominal (4 séances)", hours: 6, sessions: 4 },
  { label: "volume élevé (6 séances)", hours: 10, sessions: 6 },
];

describe("nutrition — cohérence macros / cible calorique (AC11)", () => {
  for (const profile of PROFILES) {
    it(`la somme des macros ne dépasse jamais kcal_target — ${profile.label}`, () => {
      const context = buildContext({
        profile: buildProfile({ declaredWeeklyHours: profile.hours, declaredWeeklySessions: profile.sessions }),
      });
      const { plan } = generatePlan(context, TEST_RULESET);
      expect(plan.nutritionDays.length).toBeGreaterThan(0);

      for (const day of plan.nutritionDays) {
        expect(
          macroKcal(day),
          `${day.date} (${day.modulationReason}) : ${day.proteinG} g P + ${day.carbsG} g G + ${day.fatG} g L ` +
            `= ${macroKcal(day)} kcal pour une cible de ${day.kcalTarget} kcal`,
        ).toBeLessThanOrEqual(day.kcalTarget + ROUNDING_TOLERANCE_KCAL);
      }
    });
  }

  it("les lipides ne sont jamais écrasés sur leur plancher par un budget négatif", () => {
    // Le plancher lipidique (0,5 g/kg) est un minimum de sécurité, pas une valeur de fonctionnement.
    // S'il est atteint sur toutes les journées d'entraînement, c'est que le budget calorique ne
    // finance pas les macros demandées — le symptôme exact du bug de 2026-09-10.
    const context = buildContext({ profile: buildProfile({ declaredWeeklyHours: 6, declaredWeeklySessions: 4 }) });
    const { plan } = generatePlan(context, TEST_RULESET);
    const trainingDays = plan.nutritionDays.filter((d) => d.modulationReason !== "rest");
    expect(trainingDays.length).toBeGreaterThan(0);

    const proteinCarbKcal = (day: (typeof trainingDays)[number]) =>
      day.proteinG * KCAL_PER_G_PROTEIN + day.carbsG * KCAL_PER_G_CARB;

    for (const day of trainingDays) {
      expect(
        proteinCarbKcal(day),
        `${day.date} : protéines + glucides (${proteinCarbKcal(day)} kcal) ne laissent aucun budget ` +
          `lipides sous une cible de ${day.kcalTarget} kcal`,
      ).toBeLessThan(day.kcalTarget);
    }
  });

  it("les trois macros restent strictement positives sur toutes les journées", () => {
    const context = buildContext({ profile: buildProfile({ declaredWeeklyHours: 6, declaredWeeklySessions: 4 }) });
    const { plan } = generatePlan(context, TEST_RULESET);
    for (const day of plan.nutritionDays) {
      expect(day.proteinG).toBeGreaterThan(0);
      expect(day.carbsG).toBeGreaterThan(0);
      expect(day.fatG).toBeGreaterThan(0);
    }
  });
});
