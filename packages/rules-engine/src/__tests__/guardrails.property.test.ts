/**
 * AC8 — "le test le plus important du projet" (plan §4.1).
 *
 * Property-based : pour TOUT contexte généré aléatoirement, le plan produit
 * respecte SIMULTANÉMENT :
 *  1. le plafond de progression hebdomadaire (volume/charge) ;
 *  2. le plafond de séances intenses par semaine ;
 *  3. la décharge obligatoire tous les `deload_every_n_blocks` blocs ;
 *  4. le maximum de jours consécutifs sans repos ;
 *  5. (finding B2) le plafond de progression de CHARGE (`weekly_load_progression_cap_pct`)
 *     s'applique aussi ENTRE deux versions de plan (`plan.weeks[i]` vs `context.previousPlan`,
 *     même `weekStart`) — pas seulement entre deux semaines consécutives du même brouillon.
 *     Avant correction, rien ne bornait cette comparaison-là : la semaine d'index 0 d'une
 *     révision (`weekly_review`) pouvait sauter à une charge arbitrairement plus haute que ce que
 *     l'utilisateur avait déjà vu, tant que le trigger autorisait la hausse — voir
 *     `load-progression-cap-across-versions.test.ts` pour un scénario ciblé, chiffré, de
 *     non-régression.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generatePlan } from "../generate-plan";
import { diffDays, startOfIsoWeek } from "../lib/dates";
import { arbitraryPlanningContext, arbitraryPlanningContextWithPreviousPlan } from "../../__fixtures__/arbitraries";
import { TEST_RULESET } from "../../__fixtures__/ruleset";
import type { PlanSnapshot } from "@hybride/domain";

const TOLERANCE = 1e-6;
const { guardrails } = TEST_RULESET.params;
const maxIntense = guardrails.max_intense_sessions_per_week!;
const maxConsecutive = guardrails.max_consecutive_days_without_rest!;
const everyNBlocks = guardrails.deload_every_n_blocks!;
const volumeCapPct = guardrails.weekly_volume_progression_cap_pct!;
const deloadReductionPct = guardrails.deload_volume_reduction_pct!;
const loadCapPct = guardrails.weekly_load_progression_cap_pct!;

function checkLoadProgressionAcrossVersions(plan: ReturnType<typeof generatePlan>["plan"], previousPlan: PlanSnapshot | null) {
  if (!previousPlan) return;
  const previousByWeekStart = new Map(previousPlan.weeks.map((w) => [w.weekStart, w.targetLoadUnits] as const));
  for (const week of plan.weeks) {
    const before = previousByWeekStart.get(week.weekStart);
    if (before === undefined || week.targetLoadUnits <= before) continue; // seule la HAUSSE est plafonnée (AC4)
    const allowed = before * (1 + loadCapPct / 100);
    expect(week.targetLoadUnits, `semaine ${week.weekStart} : ${before} → ${week.targetLoadUnits}`).toBeLessThanOrEqual(
      Math.round(allowed) + TOLERANCE,
    );
  }
}

function checkPlan(plan: ReturnType<typeof generatePlan>["plan"]) {
  // 3. Décharge obligatoire tous les N blocs — non désactivable.
  for (const block of plan.blocks) {
    if ((block.blockIndex + 1) % everyNBlocks !== 0) continue;
    const weeksInBlock = plan.weeks.filter((w) => w.blockIndex === block.blockIndex);
    if (weeksInBlock.length === 0) continue;
    const lastWeek = weeksInBlock[weeksInBlock.length - 1]!;
    expect(lastWeek.isDeload, `block ${block.blockIndex} devrait avoir une semaine de décharge`).toBe(true);
  }

  // 1. Plafond de progression hebdomadaire — mesuré sur la durée totale des séances par semaine ISO,
  //    seule quantité que l'étape 11 (terminale) garantit sur le calendrier complet.
  const weekStarts = Array.from(new Set(plan.sessions.map((s) => startOfIsoWeek(s.scheduledDate)))).sort();
  for (let i = 1; i < weekStarts.length; i++) {
    const weekStart = weekStarts[i]!;
    const previousWeekStart = weekStarts[i - 1]!;
    const currentDuration = plan.sessions.filter((s) => startOfIsoWeek(s.scheduledDate) === weekStart).reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    const previousDuration = plan.sessions
      .filter((s) => startOfIsoWeek(s.scheduledDate) === previousWeekStart)
      .reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    if (previousDuration <= 0) continue;

    const isDeloadWeek = plan.weeks.find((w) => w.weekStart === weekStart)?.isDeload ?? false;
    const allowedMultiplier = isDeloadWeek ? 1 - deloadReductionPct / 100 : 1 + volumeCapPct / 100;
    expect(currentDuration).toBeLessThanOrEqual(previousDuration * allowedMultiplier + previousDuration * 0.02 + TOLERANCE);
  }

  // 2. Plafond de séances intenses par semaine.
  for (const weekStart of weekStarts) {
    const intenseCount = plan.sessions.filter((s) => startOfIsoWeek(s.scheduledDate) === weekStart && s.isIntense).length;
    expect(intenseCount).toBeLessThanOrEqual(maxIntense);
  }

  // 4. Maximum de jours consécutifs sans repos, calendrier complet (pas par semaine ISO isolée).
  const sortedDates = Array.from(new Set(plan.sessions.map((s) => s.scheduledDate))).sort();
  let runLength = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    runLength = diffDays(sortedDates[i - 1]!, sortedDates[i]!) === 1 ? runLength + 1 : 1;
    expect(runLength).toBeLessThanOrEqual(maxConsecutive);
  }
}

describe("guardrails.property — AC8", () => {
  it("respecte les 4 garde-fous durs pour tout contexte généré (sans plan précédent)", () => {
    fc.assert(
      fc.property(arbitraryPlanningContext, (context) => {
        const { plan } = generatePlan(context, TEST_RULESET);
        checkPlan(plan);
      }),
      { numRuns: 200 },
    );
  });

  it("respecte les 4 garde-fous durs pour tout contexte généré (avec plan précédent, tous triggers)", () => {
    fc.assert(
      fc.property(arbitraryPlanningContextWithPreviousPlan, (context) => {
        const { plan } = generatePlan(context, TEST_RULESET);
        checkPlan(plan);
        checkLoadProgressionAcrossVersions(plan, context.previousPlan);
      }),
      { numRuns: 100 },
    );
  });
});
