import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import { computeLoadUnits } from "@hybride/rules-engine";

/**
 * `finalizeSessionLogLoad()` — CHEMIN D'ÉCRITURE UNIQUE de `session_logs.load_units` (ADR-015 §1,
 * `plans/US-02-centralisation-donnees.md` §1.6). Aucun autre module n'écrit cette colonne : ni le
 * client (révoqué du GRANT INSERT/UPDATE, `0019_actuals_data_sources.sql`), ni un futur import
 * Strava (qui appelle CE MÊME module après mapping, `lib/providers/strava/import-activity.ts`).
 *
 * Appelée APRÈS l'insertion de la ligne `session_logs` (`apply-daily-log.ts`, point de contact #1
 * de `08-architecture.md` §13.6), avec le client `service_role` — les colonnes qu'elle écrit
 * (`load_units`, et `sport_id`/`session_type` en repli SEULEMENT s'ils manquent) sont hors du GRANT
 * `authenticated`.
 *
 * Réutilise `computeLoadUnits()` du moteur (`@hybride/rules-engine/lib/load-units`), la MÊME
 * fonction pure qui calcule `planned_sessions.load_units` à la génération du plan — la charge
 * réalisée et la charge prévue restent donc strictement comparables (nécessaire à AC6 « inobservance »
 * de la F1, et à `computeHybridScore()`, ADR-014).
 */

const PARTIAL_COMPLETION_DEFAULT_RATIO = 0.5;

type SportFamily = "endurance" | "strength" | "mixed" | "skill";

export class FinalizeSessionLogLoadError extends Error {}

export interface FinalizeSessionLogLoadResult {
  loadUnits: number;
}

export async function finalizeSessionLogLoad(
  admin: SupabaseClient<Database>,
  args: { logId: string; userId: string },
): Promise<FinalizeSessionLogLoadResult> {
  const { logId, userId } = args;

  const { data: log, error: logError } = await admin
    .from("session_logs")
    .select("id, planned_session_id, completion, actual_duration_min, sport_id, session_type")
    .eq("id", logId)
    .eq("user_id", userId)
    .single();
  if (logError) throw new FinalizeSessionLogLoadError(`finalizeSessionLogLoad: lecture session_logs — ${logError.message}`);

  // AC4 (F1) — `not_done` : « pas de rattrapage, on comprend » ; aucune charge réalisée.
  if (log.completion === "not_done") {
    const { error: updateError } = await admin.from("session_logs").update({ load_units: 0 }).eq("id", logId);
    if (updateError) throw new FinalizeSessionLogLoadError(`finalizeSessionLogLoad: écriture load_units=0 — ${updateError.message}`);
    return { loadUnits: 0 };
  }

  let sessionType = log.session_type;
  let sportId = log.sport_id;
  let referenceDurationMin: number | null = null;

  // Séance PLANIFIÉE : type et discipline hérités de la séance prévue (ADR-015 §1) — ne sont
  // jamais fournis par le client dans ce cas (`CreateSessionLogInputSchema` ne les demande que pour
  // une séance hors plan, AC3).
  if (log.planned_session_id) {
    const { data: planned, error: plannedError } = await admin
      .from("planned_sessions")
      .select("session_type, sport_id, duration_min")
      .eq("id", log.planned_session_id)
      .maybeSingle();
    if (plannedError) throw new FinalizeSessionLogLoadError(`finalizeSessionLogLoad: lecture planned_sessions — ${plannedError.message}`);
    if (planned) {
      sessionType = sessionType ?? planned.session_type;
      sportId = sportId ?? planned.sport_id;
      referenceDurationMin = planned.duration_min;
    }
  }

  // Durée effective — ADR-015 §1, tableau de décision :
  //  - `partial` rattaché à un plan : charge proratisée `actual/prévue`, PLAFONNÉE à 1. Comme
  //    `computeLoadUnits()` est linéaire en durée, plafonner le RATIO revient à plafonner la durée
  //    retenue à la durée prévue — mêmes chiffres, code plus simple.
  //  - `partial` sans durée déclarée : aucune ratio calculable ; repli sur une heuristique
  //    d'ingénierie (non validée par le fondateur, même statut que le reste du Lot L2).
  //  - sinon : la durée RÉELLEMENT déclarée prime toujours ; à défaut, la durée prévue intégrale
  //    (séance rattachée, `done`) ; à défaut, 0 (ne devrait pas arriver hors plan — le schéma Zod
  //    impose `actualDurationMin` dans ce cas, ADR-015 §5).
  let durationMin: number;
  if (log.completion === "partial" && referenceDurationMin !== null) {
    durationMin =
      log.actual_duration_min !== null ? Math.min(log.actual_duration_min, referenceDurationMin) : Math.round(referenceDurationMin * PARTIAL_COMPLETION_DEFAULT_RATIO);
  } else if (log.actual_duration_min !== null) {
    durationMin = log.actual_duration_min;
  } else if (referenceDurationMin !== null) {
    durationMin = referenceDurationMin;
  } else {
    durationMin = 0;
  }

  let sportFamily: SportFamily | null = null;
  if (sportId) {
    const { data: sport, error: sportError } = await admin.from("sports").select("family").eq("id", sportId).maybeSingle();
    if (sportError) throw new FinalizeSessionLogLoadError(`finalizeSessionLogLoad: lecture sports — ${sportError.message}`);
    sportFamily = (sport?.family as SportFamily | undefined) ?? null;
  }

  // Repli neutre sur 'endurance' : ne devrait jamais être atteint en pratique (une séance planifiée
  // porte toujours `session_type not null` en base, et `CreateSessionLogInputSchema` impose
  // `sportCode` — donc indirectement un `sessionType` côté client — pour toute séance hors plan qui
  // n'est pas `not_done`, déjà écarté plus haut). Filet défensif plutôt qu'un throw qui bloquerait
  // l'enregistrement d'une saisie par ailleurs valide.
  const effectiveSessionType = sessionType ?? "endurance";
  const loadUnits = computeLoadUnits(durationMin, effectiveSessionType, sportFamily);

  const updatePayload: { load_units: number; sport_id?: string; session_type?: typeof effectiveSessionType } = { load_units: loadUnits };
  if (log.sport_id === null && sportId !== null) updatePayload.sport_id = sportId;
  if (log.session_type === null && sessionType !== null) updatePayload.session_type = sessionType;

  const { error: updateError } = await admin.from("session_logs").update(updatePayload).eq("id", logId);
  if (updateError) throw new FinalizeSessionLogLoadError(`finalizeSessionLogLoad: écriture load_units — ${updateError.message}`);

  return { loadUnits };
}
