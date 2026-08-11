/**
 * Étape 11 — `applyHardGuardrails` — tests unitaires directs des 4 branches
 * de clamp terminal (défense en profondeur, `08-architecture.md` §4.2).
 * Complète `guardrails.property.test.ts`, qui exerce ce filet de sécurité
 * indirectement via des contextes aléatoires (rarement en violation grâce
 * aux étapes proactives 1-9) : ici, on construit délibérément des semaines
 * et séances déjà EN VIOLATION pour prouver que l'étape 11 les corrige
 * quoi qu'il arrive.
 */

import { describe, expect, it } from "vitest";
import { applyHardGuardrails } from "../pipeline/11-apply-hard-guardrails";
import { createTraceFactory } from "../lib/trace";
import { addDays } from "../lib/dates";
import type { PlanWeekDraft, PlannedSessionDraft } from "@hybride/domain";
import { TEST_RULESET } from "../../__fixtures__/ruleset";

const traceFactory = createTraceFactory(TEST_RULESET.version);

function week(overrides: Partial<PlanWeekDraft>): PlanWeekDraft {
  return {
    weekStart: "2026-08-10",
    isoWeek: "2026-W33",
    blockIndex: 0,
    detailLevel: "detailed",
    isDeload: false,
    targetLoadUnits: 100,
    plannedIntenseSessions: 0,
    maxConsecutiveDaysWithoutRest: 6,
    traceIds: [],
    ...overrides,
  };
}

function session(overrides: Partial<PlannedSessionDraft>): PlannedSessionDraft {
  return {
    scheduledDate: "2026-08-10",
    slot: "unspecified",
    orderInDay: 1,
    sportCode: "running",
    sessionType: "endurance",
    detailLevel: "detailed",
    durationMin: 60,
    loadUnits: 36,
    intensityZone: "moderate",
    prescription: null,
    muscleGroups: ["quads"],
    interferenceNote: null,
    isIntense: false,
    traceIds: [],
    ...overrides,
  };
}

describe("applyHardGuardrails — AC8 (terminal)", () => {
  it("clamp de progression de volume : une semaine non-décharge dont la durée totale explose est ramenée sous le plafond", () => {
    const week1Start = "2026-08-03";
    const week2Start = "2026-08-10";
    const weeks = [week({ weekStart: week1Start, isDeload: false }), week({ weekStart: week2Start, isDeload: false })];
    const sessions = [
      session({ scheduledDate: week1Start, durationMin: 100 }),
      session({ scheduledDate: week2Start, durationMin: 400 }), // +300% — bien au-delà du plafond 10%
    ];

    const result = applyHardGuardrails(weeks, sessions, TEST_RULESET, traceFactory);

    const clamped = result.sessions.find((s) => s.scheduledDate === week2Start)!;
    expect(clamped.durationMin!).toBeLessThan(400);
    expect(clamped.durationMin!).toBeLessThanOrEqual(Math.round(100 * 1.1) + 1);
    expect(result.traces.some((t) => t.ruleId === "guardrails.weekly_progression_cap")).toBe(true);
    expect(result.guardrailsApplied.some((g) => g.guardrail === "weekly_volume_progression_cap")).toBe(true);
  });

  it("clamp de décharge : une semaine marquée is_deload dont la durée ne baisse pas assez est corrigée", () => {
    const week1Start = "2026-08-03";
    const week2Start = "2026-08-10";
    const weeks = [week({ weekStart: week1Start, isDeload: false }), week({ weekStart: week2Start, isDeload: true })];
    const sessions = [
      session({ scheduledDate: week1Start, durationMin: 200 }),
      session({ scheduledDate: week2Start, durationMin: 190 }), // devrait être <= 200*(1-45%) = 110
    ];

    const result = applyHardGuardrails(weeks, sessions, TEST_RULESET, traceFactory);
    const clamped = result.sessions.find((s) => s.scheduledDate === week2Start)!;
    expect(clamped.durationMin!).toBeLessThanOrEqual(111);
    expect(result.guardrailsApplied.some((g) => g.guardrail === "mandatory_deload")).toBe(true);
  });

  it("plafond de séances intenses par semaine : l'excédent est converti en endurance", () => {
    const weekStart = "2026-08-10";
    const weeks = [week({ weekStart })];
    const sessions = [
      session({ scheduledDate: "2026-08-10", sessionType: "interval", isIntense: true }),
      session({ scheduledDate: "2026-08-11", sessionType: "tempo", isIntense: true }),
      session({ scheduledDate: "2026-08-12", sessionType: "power", isIntense: true }),
    ];

    const result = applyHardGuardrails(weeks, sessions, TEST_RULESET, traceFactory);
    const intenseCount = result.sessions.filter((s) => s.isIntense).length;
    expect(intenseCount).toBe(TEST_RULESET.params.guardrails.max_intense_sessions_per_week);
    expect(result.guardrailsApplied.some((g) => g.guardrail === "max_intense_sessions_per_week")).toBe(true);
    expect(result.sessions.some((s) => s.sessionType === "endurance" && !s.isIntense)).toBe(true);
  });

  it("maximum de jours consécutifs sans repos : les séances excédentaires sont retirées du calendrier", () => {
    const weekStart = "2026-08-03";
    const weeks = [week({ weekStart })];
    const sessions = Array.from({ length: 8 }, (_, i) => session({ scheduledDate: addDays(weekStart, i) }));

    const result = applyHardGuardrails(weeks, sessions, TEST_RULESET, traceFactory);
    expect(result.sessions.length).toBe(6); // max_consecutive_days_without_rest du ruleset de test
    expect(result.guardrailsApplied.some((g) => g.guardrail === "max_consecutive_days_without_rest")).toBe(true);

    // Aucune trace n'est réutilisée pour deux séances distinctes retirées.
    const removalTraces = result.traces.filter((t) => t.ruleId === "guardrails.rest_day_inserted");
    expect(removalTraces).toHaveLength(2);
  });

  it("aucune violation ⟹ aucun garde-fou déclenché, plan inchangé", () => {
    const weekStart = "2026-08-10";
    const weeks = [week({ weekStart })];
    const sessions = [session({ scheduledDate: weekStart, durationMin: 45 })];
    const result = applyHardGuardrails(weeks, sessions, TEST_RULESET, traceFactory);
    expect(result.guardrailsApplied).toHaveLength(0);
    expect(result.sessions).toHaveLength(1);
  });
});
