/**
 * AC5, ADR-015 §2 — appariement, priorité de fusion et enrichissement. Fonctions PURES uniquement
 * (`findReconciliationMatch`, `pickSurvivingLog`, `buildEnrichmentPayload`) : pas de client
 * Supabase, pas de base — la partie "application" (`reconcileSessionLogs()`) est couverte par les
 * tests d'intégration de `tester` (base réelle).
 */

import { describe, expect, it } from "vitest";
import { buildEnrichmentPayload, findReconciliationMatch, pickSurvivingLog, type EnrichableFields, type ReconciliationCandidate } from "./reconcile-session-logs";
import type { Database } from "@hybride/db";

type DataSource = Database["public"]["Enums"]["data_source"];
interface SurvivingCandidate {
  source: DataSource;
  createdAt: string;
  id: string;
}

function candidate(overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  return {
    id: "log-a",
    source: "declared",
    loggedDate: "2026-08-12",
    startedAt: null,
    sportId: "sport-running",
    sportFamily: "endurance",
    createdAt: "2026-08-12T08:00:00.000Z",
    ...overrides,
  };
}

describe("findReconciliationMatch — AC5, ADR-015 §2 critères 1-4", () => {
  it("apparie deux lignes dont startedAt est à moins de 90 min d'écart, même discipline", () => {
    const target = candidate({ id: "declared-1", startedAt: "2026-08-12T07:00:00.000Z" });
    const other = candidate({ id: "connected-1", source: "connected", startedAt: "2026-08-12T07:20:00.000Z" });

    const match = findReconciliationMatch(target, [target, other]);
    expect(match?.candidate.id).toBe("connected-1");
    expect(match?.evidence.rule).toBe("started_at_overlap");
    expect(match?.evidence.minutesApart).toBe(20);
  });

  it("ne retient pas une correspondance à plus de 90 min d'écart", () => {
    const target = candidate({ id: "declared-1", startedAt: "2026-08-12T07:00:00.000Z" });
    const other = candidate({ id: "connected-1", source: "connected", startedAt: "2026-08-12T09:00:00.000Z" });

    expect(findReconciliationMatch(target, [target, other])).toBeNull();
  });

  it("replie sur `loggedDate` identique quand l'une des deux lignes n'a pas d'heure de début", () => {
    const target = candidate({ id: "declared-1", startedAt: null, loggedDate: "2026-08-12" });
    const other = candidate({ id: "connected-1", source: "connected", startedAt: null, loggedDate: "2026-08-12" });

    const match = findReconciliationMatch(target, [target, other]);
    expect(match?.candidate.id).toBe("connected-1");
    expect(match?.evidence.rule).toBe("same_logged_date");
  });

  it("compatibilité de discipline : même sport_id requis quand les deux sont connus", () => {
    const target = candidate({ id: "declared-1", loggedDate: "2026-08-12", sportId: "running", sportFamily: "endurance" });
    const other = candidate({ id: "connected-1", source: "connected", loggedDate: "2026-08-12", sportId: "cycling", sportFamily: "endurance" });

    expect(findReconciliationMatch(target, [target, other])).toBeNull();
  });

  it("compatibilité de discipline : famille identique suffit quand un sport_id est nul", () => {
    const target = candidate({ id: "declared-1", loggedDate: "2026-08-12", sportId: null, sportFamily: "endurance" });
    const other = candidate({ id: "connected-1", source: "connected", loggedDate: "2026-08-12", sportId: "running", sportFamily: "endurance" });

    expect(findReconciliationMatch(target, [target, other])?.candidate.id).toBe("connected-1");
  });

  it("candidats multiples : retient le plus proche dans le temps", () => {
    const target = candidate({ id: "declared-1", startedAt: "2026-08-12T07:00:00.000Z" });
    const far = candidate({ id: "far", source: "connected", startedAt: "2026-08-12T07:50:00.000Z" });
    const near = candidate({ id: "near", source: "connected", startedAt: "2026-08-12T07:10:00.000Z" });

    expect(findReconciliationMatch(target, [target, far, near])?.candidate.id).toBe("near");
  });

  it("candidats à égalité stricte : retient le plus ancien createdAt", () => {
    const target = candidate({ id: "declared-1", loggedDate: "2026-08-12", startedAt: null });
    const newer = candidate({ id: "newer", source: "connected", loggedDate: "2026-08-12", startedAt: null, createdAt: "2026-08-12T09:00:00.000Z" });
    const older = candidate({ id: "older", source: "connected", loggedDate: "2026-08-12", startedAt: null, createdAt: "2026-08-12T08:00:00.000Z" });

    expect(findReconciliationMatch(target, [target, newer, older])?.candidate.id).toBe("older");
  });

  it("ne s'apparie jamais avec elle-même", () => {
    const target = candidate({ id: "declared-1", loggedDate: "2026-08-12" });
    expect(findReconciliationMatch(target, [target])).toBeNull();
  });
});

describe("pickSurvivingLog — ADR-015 §2 (le mesuré prime sur le déclaré)", () => {
  it("la ligne CONNECTÉE gagne, quel que soit l'ordre des arguments", () => {
    const declared: SurvivingCandidate = { source: "declared", createdAt: "2026-08-12T07:00:00.000Z", id: "d" };
    const connected: SurvivingCandidate = { source: "connected", createdAt: "2026-08-12T07:05:00.000Z", id: "c" };

    expect(pickSurvivingLog(declared, connected).winner.id).toBe("c");
    expect(pickSurvivingLog(connected, declared).winner.id).toBe("c");
  });

  it("import puis saisie ET saisie puis import produisent le même état final (ADR-015 §2, réversibilité de l'ordre)", () => {
    const declared: SurvivingCandidate = { source: "declared", createdAt: "2026-08-12T07:00:00.000Z", id: "d" };
    const connected: SurvivingCandidate = { source: "connected", createdAt: "2026-08-12T07:05:00.000Z", id: "c" };

    const importThenLog = pickSurvivingLog(connected, declared);
    const logThenImport = pickSurvivingLog(declared, connected);
    expect(importThenLog.winner.id).toBe(logThenImport.winner.id);
    expect(importThenLog.loser.id).toBe(logThenImport.loser.id);
  });

  it("même provenance des deux côtés : la plus ancienne reste portante", () => {
    const older: SurvivingCandidate = { source: "declared", createdAt: "2026-08-12T07:00:00.000Z", id: "older" };
    const newer: SurvivingCandidate = { source: "declared", createdAt: "2026-08-12T08:00:00.000Z", id: "newer" };
    expect(pickSurvivingLog(older, newer).winner.id).toBe("older");
    expect(pickSurvivingLog(newer, older).winner.id).toBe("older");
  });
});

describe("buildEnrichmentPayload — ADR-015 §2 (le ressenti n'est jamais perdu)", () => {
  const winnerBase: EnrichableFields = {
    rpe: null,
    freshness: null,
    pain: "none",
    painZone: null,
    painAtRest: false,
    comment: null,
    notDoneReason: null,
  };

  it("transfère RPE, fraîcheur et commentaire du perdant si le gagnant ne les porte pas", () => {
    const loser: EnrichableFields = { ...winnerBase, rpe: 7, freshness: 3, comment: "jambes lourdes" };
    const payload = buildEnrichmentPayload(winnerBase, loser);
    expect(payload).toEqual({ rpe: 7, freshness: 3, comment: "jambes lourdes" });
  });

  it("ne transfère JAMAIS un champ déjà porté par le gagnant (jamais un écrasement)", () => {
    const winner: EnrichableFields = { ...winnerBase, rpe: 5 };
    const loser: EnrichableFields = { ...winnerBase, rpe: 9 };
    expect(buildEnrichmentPayload(winner, loser).rpe).toBeUndefined();
  });

  it("un signal de douleur du perdant est transféré au gagnant en l'absence de douleur chez ce dernier — sécurité AC9 de la F1", () => {
    const loser: EnrichableFields = { ...winnerBase, pain: "pain", painZone: "knee", painAtRest: true };
    const payload = buildEnrichmentPayload(winnerBase, loser);
    expect(payload.pain).toBe("pain");
    expect(payload.painZone).toBe("knee");
    expect(payload.painAtRest).toBe(true);
  });

  it("un signal de douleur du GAGNANT n'est jamais écrasé par l'absence de douleur du perdant", () => {
    const winner: EnrichableFields = { ...winnerBase, pain: "pain", painZone: "hip", painAtRest: false };
    const loser: EnrichableFields = { ...winnerBase, pain: "none" };
    const payload = buildEnrichmentPayload(winner, loser);
    expect(payload.pain).toBeUndefined();
    expect(payload.painZone).toBeUndefined();
  });

  it("aucun champ à transférer ⟹ payload vide", () => {
    const winner: EnrichableFields = { ...winnerBase, rpe: 5, freshness: 4, comment: "ok", pain: "light", painZone: "ankle" };
    const loser: EnrichableFields = { ...winnerBase };
    expect(buildEnrichmentPayload(winner, loser)).toEqual({});
  });
});
