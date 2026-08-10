/**
 * AC9 — protocole douleur à 3 niveaux (machine à états, `08-architecture.md` §4.4) :
 *  - gêne légère isolée ⟹ adaptation, aucune alerte ;
 *  - douleur persistante sur plusieurs séances consécutives, même zone ⟹
 *    pause de la zone + recommandation de consultation ;
 *  - douleur à l'effort ET au repos ⟹ arrêt total, orientation professionnel
 *    de santé, SANS alternative d'auto-adaptation.
 */

import { describe, expect, it } from "vitest";
import { evaluatePainProtocol } from "../pain-protocol.js";
import { generatePlan } from "../generate-plan.js";
import { createTraceFactory } from "../lib/trace.js";
import { buildContext, buildPainEpisode, buildSessionLog, FIXED_NOW } from "../../__fixtures__/planning-context.js";
import { TEST_RULESET } from "../../__fixtures__/ruleset.js";

function evaluate(overrides: Parameters<typeof buildContext>[0]) {
  const context = buildContext(overrides);
  const traceFactory = createTraceFactory(TEST_RULESET.version);
  return evaluatePainProtocol(context, TEST_RULESET, traceFactory);
}

describe("evaluatePainProtocol — AC9", () => {
  it("niveau 1 — gêne légère isolée : adaptation sans alerte", () => {
    const result = evaluate({
      history: {
        sessionLogs: [buildSessionLog({ pain: "light", painZone: "knee", painAtRest: false })],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });
    const zoneState = result.zoneStates.find((z) => z.zone === "knee")!;
    expect(zoneState.level).toBe("light");
    expect(zoneState.zoneBlocked).toBe(false);
    expect(zoneState.referralRequired).toBe(false);
  });

  it("niveau 2 — douleur persistante sur plusieurs séances consécutives, même zone : pause + consultation", () => {
    const result = evaluate({
      painEpisodes: [buildPainEpisode({ zone: "knee", level: "light", consecutiveSignals: 2, resolvedAt: null })],
      history: {
        sessionLogs: [buildSessionLog({ pain: "light", painZone: "knee", painAtRest: false })],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });
    const zoneState = result.zoneStates.find((z) => z.zone === "knee")!;
    expect(zoneState.level).toBe("persistent");
    expect(zoneState.zoneBlocked).toBe(true);
    expect(zoneState.referralRequired).toBe(true);
  });

  it("niveau 3 — douleur à l'effort ET au repos : arrêt total, orientation, SANS alternative d'auto-adaptation", () => {
    const result = evaluate({
      history: {
        sessionLogs: [buildSessionLog({ pain: "pain", painZone: "knee", painAtRest: true })],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });
    const zoneState = result.zoneStates.find((z) => z.zone === "knee")!;
    expect(zoneState.level).toBe("acute");
    expect(zoneState.zoneBlocked).toBe(true);
    expect(zoneState.referralRequired).toBe(true);
    expect(zoneState.autoAdaptationAllowed).toBe(false);
  });

  it("niveau 3 — le plan généré n'inclut aucune séance sollicitant la zone acute (aucune alternative)", () => {
    const context = buildContext({
      sports: [
        {
          sportId: "sport-running",
          code: "running",
          family: "endurance",
          defaultMuscleGroups: ["quads", "hamstrings"],
          isDocumented: true,
          level: "intermediate",
          priority: 1,
          weeklySessionsDeclared: 5,
          isPrimary: true,
        },
      ],
      history: {
        sessionLogs: [buildSessionLog({ loggedDate: FIXED_NOW, pain: "pain", painZone: "knee", painAtRest: true })],
        nutritionCheckins: [],
        bodyMetrics: [],
        completedWeeks: [],
      },
    });
    const { plan } = generatePlan(context, TEST_RULESET);
    const quadsOrHamstringsSessions = plan.sessions.filter((s) => s.muscleGroups.includes("quads") || s.muscleGroups.includes("hamstrings"));
    expect(quadsOrHamstringsSessions).toHaveLength(0);
  });
});
