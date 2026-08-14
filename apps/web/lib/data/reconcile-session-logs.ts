import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type { Json } from "@hybride/db/types";

/**
 * `reconcileSessionLogs()` — AC5, ADR-015 §2. Résout le doublon déclaré/connecté : appariement PUR
 * (`findReconciliationMatch`, `pickSurvivingLog`, `buildEnrichmentPayload` — testables sans base),
 * puis application (exclusion réversible de la ligne perdante, enrichissement de la ligne portante).
 *
 * Appelée dans les DEUX SENS chronologiques (ADR-015 §2, dernier paragraphe) : après une saisie
 * manuelle (`apply-daily-log.ts`) ET après un import (`lib/jobs/sync-data-connection.ts`) — la même
 * fonction, appelée avec l'id de la ligne qui vient d'être insérée.
 */

const DEFAULT_MATCH_WINDOW_MIN = 90;

type SportFamily = "endurance" | "strength" | "mixed" | "skill";
type DataSource = Database["public"]["Enums"]["data_source"];
type BodyZone = Database["public"]["Enums"]["body_zone"];
type PainLevel = Database["public"]["Enums"]["pain_level"];

// ---------------------------------------------------------------------------
// Appariement — PUR, 0 I/O (ADR-015 §2, critères 1-4)
// ---------------------------------------------------------------------------

export interface ReconciliationCandidate {
  id: string;
  source: DataSource;
  loggedDate: string; // ISO date
  startedAt: string | null; // ISO datetime
  sportId: string | null;
  sportFamily: SportFamily | null;
  createdAt: string; // ISO datetime — départage les candidats à égalité
}

export interface MatchEvidence {
  rule: "started_at_overlap" | "same_logged_date";
  matchWindowMin: number;
  candidateId: string;
  minutesApart: number | null;
  confidence: "high" | "medium";
}

export interface ReconciliationMatch {
  candidate: ReconciliationCandidate;
  evidence: MatchEvidence;
}

/** Critère 3 — même `sport_id`, ou même famille quand l'un des deux `sport_id` est nul. */
function isDisciplineCompatible(a: Pick<ReconciliationCandidate, "sportId" | "sportFamily">, b: Pick<ReconciliationCandidate, "sportId" | "sportFamily">): boolean {
  if (a.sportId !== null && b.sportId !== null) return a.sportId === b.sportId;
  if (a.sportFamily !== null && b.sportFamily !== null) return a.sportFamily === b.sportFamily;
  return true; // discipline inconnue d'un côté (ou des deux) : pas de contradiction avérée.
}

function minutesBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;
}

/**
 * Cherche, parmi `candidates` (autres lignes NON EXCLUES du même utilisateur, déjà bornées par
 * l'appelant à une fenêtre de dates raisonnable), la meilleure correspondance pour `target`.
 * Critère 2 — recouvrement temporel si les deux lignes portent `startedAt`, repli sur
 * `loggedDate` identique sinon. Critère 4 — le plus proche dans le temps puis le plus ancien.
 */
export function findReconciliationMatch(
  target: ReconciliationCandidate,
  candidates: ReconciliationCandidate[],
  params: { matchWindowMin?: number } = {},
): ReconciliationMatch | null {
  const matchWindowMin = params.matchWindowMin ?? DEFAULT_MATCH_WINDOW_MIN;

  const scored: ReconciliationMatch[] = [];
  for (const candidate of candidates) {
    if (candidate.id === target.id) continue;
    if (!isDisciplineCompatible(target, candidate)) continue;

    if (target.startedAt && candidate.startedAt) {
      const minutesApart = minutesBetween(target.startedAt, candidate.startedAt);
      if (minutesApart <= matchWindowMin) {
        scored.push({ candidate, evidence: { rule: "started_at_overlap", matchWindowMin, candidateId: candidate.id, minutesApart, confidence: "high" } });
      }
      continue;
    }
    if (target.loggedDate === candidate.loggedDate) {
      scored.push({ candidate, evidence: { rule: "same_logged_date", matchWindowMin, candidateId: candidate.id, minutesApart: null, confidence: "medium" } });
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    const gapA = a.evidence.minutesApart ?? Number.POSITIVE_INFINITY;
    const gapB = b.evidence.minutesApart ?? Number.POSITIVE_INFINITY;
    if (gapA !== gapB) return gapA - gapB;
    return a.candidate.createdAt < b.candidate.createdAt ? -1 : a.candidate.createdAt > b.candidate.createdAt ? 1 : 0;
  });

  return scored[0]!;
}

// ---------------------------------------------------------------------------
// Priorité de fusion — PUR (ADR-015 §2)
// ---------------------------------------------------------------------------

/**
 * La ligne CONNECTÉE est retenue comme ligne portante quand les deux provenances diffèrent
 * (ADR-015 §2 — « le mesuré prime sur le déclaré »). Deux lignes de MÊME provenance (cas non
 * tranché par l'ADR — deux saisies manuelles du même événement, par exemple) : la plus ancienne
 * reste portante, choix arbitraire mais déterministe et stable.
 */
export function pickSurvivingLog<T extends { source: DataSource; createdAt: string }>(a: T, b: T): { winner: T; loser: T } {
  if (a.source === "connected" && b.source !== "connected") return { winner: a, loser: b };
  if (b.source === "connected" && a.source !== "connected") return { winner: b, loser: a };
  return a.createdAt <= b.createdAt ? { winner: a, loser: b } : { winner: b, loser: a };
}

// ---------------------------------------------------------------------------
// Enrichissement — PUR (ADR-015 §2 : « le ressenti n'est jamais perdu »)
// ---------------------------------------------------------------------------

export interface EnrichableFields {
  rpe: number | null;
  freshness: number | null;
  pain: PainLevel;
  painZone: BodyZone | null;
  painAtRest: boolean;
  comment: string | null;
  notDoneReason: string | null;
}

/**
 * Champs transférés du PERDANT vers le GAGNANT, UNIQUEMENT s'ils sont absents du gagnant (ADR-015
 * §2 : « s'ils sont absents de celle-ci ») — jamais un écrasement. `pain`/`painZone`/`painAtRest`
 * traités comme un GROUPE : un signal de douleur n'est jamais écrasé, dans aucun sens de fusion, et
 * ne se transfère jamais partiellement (une zone sans son niveau serait incohérente).
 */
export function buildEnrichmentPayload(winner: EnrichableFields, loser: EnrichableFields): Partial<EnrichableFields> {
  const payload: Partial<EnrichableFields> = {};

  if (winner.rpe === null && loser.rpe !== null) payload.rpe = loser.rpe;
  if (winner.freshness === null && loser.freshness !== null) payload.freshness = loser.freshness;
  if (winner.comment === null && loser.comment !== null) payload.comment = loser.comment;
  if (winner.notDoneReason === null && loser.notDoneReason !== null) payload.notDoneReason = loser.notDoneReason;

  if (winner.pain === "none" && loser.pain !== "none") {
    payload.pain = loser.pain;
    payload.painZone = loser.painZone;
    payload.painAtRest = loser.painAtRest;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Application — effets de bord (service_role)
// ---------------------------------------------------------------------------

interface FullSessionLogRow extends ReconciliationCandidate {
  rpe: number | null;
  freshness: number | null;
  pain: PainLevel;
  painZone: BodyZone | null;
  painAtRest: boolean;
  comment: string | null;
  notDoneReason: string | null;
}

async function fetchCandidateRows(admin: SupabaseClient<Database>, userId: string, aroundDate: string): Promise<FullSessionLogRow[]> {
  // Fenêtre large (±1 jour calendaire) pour couvrir un `startedAt` proche de minuit dont
  // `loggedDate` diffère d'un jour du candidat qu'il doit apparier — le filtrage précis reste celui
  // de `findReconciliationMatch()` (fenêtre en MINUTES sur `startedAt`), cette requête ne fait que
  // borner le volume lu.
  const from = new Date(`${aroundDate}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${aroundDate}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);

  const { data, error } = await admin
    .from("session_logs")
    .select(
      "id, source, logged_date, started_at, sport_id, created_at, rpe, freshness, pain, pain_zone, pain_at_rest, comment, not_done_reason, sports(family)",
    )
    .eq("user_id", userId)
    .is("excluded_at", null)
    .gte("logged_date", from.toISOString().slice(0, 10))
    .lte("logged_date", to.toISOString().slice(0, 10));
  if (error) throw new Error(`reconcileSessionLogs: lecture session_logs (candidats) — ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    loggedDate: row.logged_date,
    startedAt: row.started_at,
    sportId: row.sport_id,
    sportFamily: ((row.sports as unknown as { family: SportFamily } | null)?.family ?? null),
    createdAt: row.created_at,
    rpe: row.rpe,
    freshness: row.freshness,
    pain: row.pain,
    painZone: row.pain_zone,
    painAtRest: row.pain_at_rest,
    comment: row.comment,
    notDoneReason: row.not_done_reason,
  }));
}

export interface ReconcileSessionLogsResult {
  merged: boolean;
  survivingLogId: string;
}

export async function reconcileSessionLogs(admin: SupabaseClient<Database>, args: { userId: string; logId: string }): Promise<ReconcileSessionLogsResult> {
  const { userId, logId } = args;

  // La fenêtre de lecture est centrée sur la date de LA LIGNE CIBLE (pas sur "aujourd'hui") : un
  // import rétroactif (rattrapage 90 jours, `strava_backfill`) doit apparier contre des candidats
  // proches de SA PROPRE date, pas de la date du jour.
  const { data: targetDateRow, error: targetDateError } = await admin
    .from("session_logs")
    .select("logged_date")
    .eq("id", logId)
    .eq("user_id", userId)
    .single();
  if (targetDateError) throw new Error(`reconcileSessionLogs: lecture de la ligne cible — ${targetDateError.message}`);

  const rows = await fetchCandidateRows(admin, userId, targetDateRow.logged_date);
  const target = rows.find((r) => r.id === logId);
  if (!target) throw new Error(`reconcileSessionLogs: ligne ${logId} introuvable ou déjà exclue (utilisateur ${userId}).`);

  const match = findReconciliationMatch(target, rows);
  if (!match) return { merged: false, survivingLogId: logId };

  const matchedRow = rows.find((r) => r.id === match.candidate.id);
  if (!matchedRow) throw new Error(`reconcileSessionLogs: incohérence interne — candidat apparié ${match.candidate.id} absent des lignes chargées.`);

  const { winner, loser } = pickSurvivingLog(target, matchedRow);

  const enrichment = buildEnrichmentPayload(winner, loser);
  if (Object.keys(enrichment).length > 0) {
    const { error: enrichError } = await admin
      .from("session_logs")
      .update({
        ...(enrichment.rpe !== undefined ? { rpe: enrichment.rpe } : {}),
        ...(enrichment.freshness !== undefined ? { freshness: enrichment.freshness } : {}),
        ...(enrichment.comment !== undefined ? { comment: enrichment.comment } : {}),
        ...(enrichment.notDoneReason !== undefined ? { not_done_reason: enrichment.notDoneReason } : {}),
        ...(enrichment.pain !== undefined ? { pain: enrichment.pain, pain_zone: enrichment.painZone, pain_at_rest: enrichment.painAtRest } : {}),
      })
      .eq("id", winner.id);
    if (enrichError) throw new Error(`reconcileSessionLogs: enrichissement de la ligne portante ${winner.id} — ${enrichError.message}`);
  }

  const { error: excludeError } = await admin
    .from("session_logs")
    .update({
      excluded_at: new Date().toISOString(),
      exclusion_reason: "merged_duplicate",
      superseded_by_log_id: winner.id,
      match_evidence: match.evidence as unknown as Json,
    })
    .eq("id", loser.id);
  if (excludeError) throw new Error(`reconcileSessionLogs: exclusion de la ligne perdante ${loser.id} — ${excludeError.message}`);

  return { merged: true, survivingLogId: winner.id };
}
