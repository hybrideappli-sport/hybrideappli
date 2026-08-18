import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@hybride/db";
import type {
  DaySlot,
  MuscleGroup,
  PlacementCalendarWindowInput,
  PlacementFrozenOccupancyInput,
  PlacementIncidentWindowInput,
  PlacementInput,
  PlacementSessionInput,
  PlacementTriggerReason,
  Ruleset,
  SessionType,
} from "@hybride/domain";

import { addDaysIso } from "../dates";
import { fetchCurrentPlacementsBySessionId, isWithinReportableWindow, type CurrentPlacementRow } from "./read-session-placements";

/**
 * Charge séances, disponibilités, imprévus, placements gelés → entrée de `placeWeekSessions()`
 * (fonction pure). Toute la lecture vit ici, exactement comme `build-planning-context.ts` pour le
 * moteur F1 : aucune requête ne fuit dans `@hybride/rules-engine`.
 */

interface PlannedSessionRow {
  id: string;
  scheduled_date: string;
  slot: DaySlot;
  duration_min: number | null;
  session_type: SessionType;
  muscle_groups: MuscleGroup[];
  order_in_day: number;
}

async function fetchCalendar(admin: SupabaseClient<Database>, userId: string): Promise<PlacementCalendarWindowInput[]> {
  const { data, error } = await admin.from("availability_slots").select("weekday, slot, is_available, max_minutes").eq("user_id", userId);
  if (error) throw new Error(`buildPlacementInput: availability_slots — ${error.message}`);
  return (data ?? []).map((row) => ({ weekday: row.weekday, slot: row.slot, isAvailable: row.is_available, maxMinutes: row.max_minutes }));
}

async function fetchOpenIncidentWindows(admin: SupabaseClient<Database>, userId: string, weekStart: string): Promise<PlacementIncidentWindowInput[]> {
  const weekEnd = addDaysIso(weekStart, 6);
  const { data, error } = await admin
    .from("schedule_incidents")
    .select("reported_for_date, blocked_from, blocked_to")
    .eq("user_id", userId)
    .is("closed_out_at", null)
    .gte("reported_for_date", weekStart)
    .lte("reported_for_date", weekEnd);
  if (error) throw new Error(`buildPlacementInput: schedule_incidents — ${error.message}`);
  return (data ?? []).map((row) => ({ date: row.reported_for_date, fromTime: row.blocked_from.slice(0, 5), toTime: row.blocked_to.slice(0, 5) }));
}

async function fetchWeekSessions(admin: SupabaseClient<Database>, planVersionId: string, weekStart: string): Promise<PlannedSessionRow[]> {
  const weekEnd = addDaysIso(weekStart, 6);
  const { data, error } = await admin
    .from("planned_sessions")
    .select("id, scheduled_date, slot, duration_min, session_type, muscle_groups, order_in_day")
    .eq("plan_version_id", planVersionId)
    .gte("scheduled_date", weekStart)
    .lte("scheduled_date", weekEnd);
  if (error) throw new Error(`buildPlacementInput: planned_sessions — ${error.message}`);
  return data ?? [];
}

function toFrozenOccupancy(session: PlannedSessionRow, placement: CurrentPlacementRow): PlacementFrozenOccupancyInput | null {
  if (placement.status === "cancelled_week" || !placement.scheduledDate || !placement.scheduledTime) return null;
  return {
    date: placement.scheduledDate,
    startTime: placement.scheduledTime,
    durationMin: session.duration_min ?? 0,
    sessionType: session.session_type,
    muscleGroups: session.muscle_groups,
  };
}

/**
 * Entrée complète pour un recalcul PORTANT SUR TOUTE LA SEMAINE — `initial`/`plan_regenerated`
 * (toutes les séances sont fraîches, aucun placement existant) ou `availability_changed` (les
 * séances déjà passées, ou à moins de `min_lead_time_min`, restent gelées ; les autres sont
 * redécidées, leur `origin` copié depuis leur placement courant).
 */
export async function buildPlacementInputForWeek(
  admin: SupabaseClient<Database>,
  args: { userId: string; planVersionId: string; weekStart: string; now: { date: string; time: string }; triggerReason: PlacementTriggerReason; ruleset: Ruleset },
): Promise<{ input: PlacementInput; slotBySessionId: Map<string, DaySlot> } | null> {
  const { userId, planVersionId, weekStart, now, triggerReason, ruleset } = args;

  const sessions = await fetchWeekSessions(admin, planVersionId, weekStart);
  if (sessions.length === 0) return null;

  const [calendar, incidentWindows] = await Promise.all([fetchCalendar(admin, userId), fetchOpenIncidentWindows(admin, userId, weekStart)]);

  const slotBySessionId = new Map<string, DaySlot>(sessions.map((s) => [s.id, s.slot]));

  const isFreshWeek = triggerReason === "initial" || triggerReason === "plan_regenerated";
  const existingByPlannedSessionId = isFreshWeek
    ? new Map<string, CurrentPlacementRow>()
    : await fetchCurrentPlacementsBySessionId(admin, { userId, plannedSessionIds: sessions.map((s) => s.id) });

  const minLeadTimeMin = ruleset.params.planning.min_lead_time_min;
  const sessionsToPlace: PlacementSessionInput[] = [];
  const frozenOccupancy: PlacementFrozenOccupancyInput[] = [];

  for (const session of sessions) {
    const existing = existingByPlannedSessionId.get(session.id) ?? null;

    const isPastOrTooSoon =
      existing !== null &&
      existing.scheduledDate !== null &&
      existing.scheduledTime !== null &&
      (existing.scheduledDate < now.date ||
        (existing.scheduledDate === now.date && timeToMinutes(existing.scheduledTime) < timeToMinutes(now.time) + minLeadTimeMin));

    if (!isFreshWeek && isPastOrTooSoon && existing) {
      const occupancy = toFrozenOccupancy(session, existing);
      if (occupancy) frozenOccupancy.push(occupancy);
      continue;
    }

    sessionsToPlace.push({
      sessionId: session.id,
      scheduledDate: session.scheduled_date,
      slot: session.slot,
      durationMin: session.duration_min,
      sessionType: session.session_type,
      muscleGroups: session.muscle_groups,
      orderInDay: session.order_in_day,
      origin: existing ? { date: existing.originDate, time: existing.originTime } : null,
    });
  }

  if (sessionsToPlace.length === 0) return null;

  const input: PlacementInput = {
    weekStart,
    now,
    triggerReason,
    incidentId: null,
    calendar,
    incidentWindows,
    frozenOccupancy,
    sessions: sessionsToPlace,
  };
  return { input, slotBySessionId };
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => Number.parseInt(v, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface IncidentPlacementInputResult {
  input: PlacementInput;
  slotBySessionId: Map<string, DaySlot>;
  currentPlacement: CurrentPlacementRow;
  planVersionId: string;
  weekStart: string;
  blockedWindow: { date: string; fromTime: string; toTime: string; blockedSlot: DaySlot };
}

/**
 * Entrée pour la résolution SYNCHRONE d'un imprévu (`POST /schedule/incidents`) — recalcul LOCAL
 * (ADR-016 §7) : une seule séance à décider, toutes les autres de la semaine gelées.
 */
export async function buildPlacementInputForIncident(
  admin: SupabaseClient<Database>,
  args: { userId: string; plannedSessionId: string; now: { date: string; time: string }; incidentId: string; ruleset: Ruleset },
): Promise<IncidentPlacementInputResult | null> {
  const { userId, plannedSessionId, now, incidentId, ruleset } = args;

  const { data: placementRow, error: placementError } = await admin
    .from("session_placements")
    .select("id, planned_session_id, status, scheduled_date, scheduled_time, origin_date, origin_time, reason, incident_id, plan_version_id, week_start")
    .eq("user_id", userId)
    .eq("planned_session_id", plannedSessionId)
    .is("superseded_at", null)
    .maybeSingle();
  if (placementError) throw new Error(`buildPlacementInputForIncident: session_placements — ${placementError.message}`);
  if (!placementRow || placementRow.status === "cancelled_week" || !placementRow.scheduled_date || !placementRow.scheduled_time) return null;

  const currentPlacement: CurrentPlacementRow = {
    id: placementRow.id,
    plannedSessionId: placementRow.planned_session_id,
    status: placementRow.status,
    scheduledDate: placementRow.scheduled_date,
    scheduledTime: placementRow.scheduled_time,
    originDate: placementRow.origin_date,
    originTime: placementRow.origin_time,
    reason: placementRow.reason,
    incidentId: placementRow.incident_id,
  };

  // Contrôle d'admission — `08-architecture.md` §14.5 : une séance déjà passée, ou à moins de
  // `min_lead_time_min` de l'instant courant, n'est plus signalable (`409 SESSION_NOT_REPORTABLE`).
  // Même fenêtre que `canReportIncident` côté lecture (`isWithinReportableWindow`,
  // `read-session-placements.ts`) — sans ce contrôle ici, l'écriture acceptait un signalement que la
  // lecture aurait pourtant refusé d'afficher comme signalable.
  if (!isWithinReportableWindow(currentPlacement, now, ruleset.params.planning.min_lead_time_min)) return null;

  const planVersionId = placementRow.plan_version_id;
  const weekStart = placementRow.week_start;

  const { data: targetSession, error: targetSessionError } = await admin
    .from("planned_sessions")
    .select("id, scheduled_date, slot, duration_min, session_type, muscle_groups, order_in_day")
    .eq("id", plannedSessionId)
    .maybeSingle();
  if (targetSessionError) throw new Error(`buildPlacementInputForIncident: planned_sessions (cible) — ${targetSessionError.message}`);
  if (!targetSession) return null;

  const margin = ruleset.params.planning.incident_block_margin_min;
  const durationMin = targetSession.duration_min ?? 0;
  const startMin = timeToMinutes(currentPlacement.scheduledTime!);
  const blockedFromMin = Math.max(0, startMin - margin);
  const blockedToMin = Math.min(24 * 60, startMin + durationMin + margin);
  const blockedWindow = {
    date: currentPlacement.scheduledDate!,
    fromTime: minutesToTime(blockedFromMin),
    toTime: minutesToTime(blockedToMin),
    blockedSlot: targetSession.slot,
  };

  const [allWeekSessions, calendar, otherIncidentWindows] = await Promise.all([
    fetchWeekSessions(admin, planVersionId, weekStart),
    fetchCalendar(admin, userId),
    fetchOpenIncidentWindows(admin, userId, weekStart),
  ]);

  const otherSessions = allWeekSessions.filter((s) => s.id !== plannedSessionId);
  const otherPlacements = await fetchCurrentPlacementsBySessionId(admin, { userId, plannedSessionIds: otherSessions.map((s) => s.id) });

  const frozenOccupancy: PlacementFrozenOccupancyInput[] = [];
  for (const session of otherSessions) {
    const placement = otherPlacements.get(session.id);
    if (!placement) continue;
    const occupancy = toFrozenOccupancy(session, placement);
    if (occupancy) frozenOccupancy.push(occupancy);
  }

  const slotBySessionId = new Map<string, DaySlot>([[targetSession.id, targetSession.slot]]);

  const input: PlacementInput = {
    weekStart,
    now,
    triggerReason: "incident_reported",
    incidentId,
    calendar,
    incidentWindows: [...otherIncidentWindows, { date: blockedWindow.date, fromTime: blockedWindow.fromTime, toTime: blockedWindow.toTime }],
    frozenOccupancy,
    sessions: [
      {
        sessionId: targetSession.id,
        scheduledDate: targetSession.scheduled_date,
        slot: targetSession.slot,
        durationMin: targetSession.duration_min,
        sessionType: targetSession.session_type,
        muscleGroups: targetSession.muscle_groups,
        orderInDay: targetSession.order_in_day,
        origin: { date: currentPlacement.originDate, time: currentPlacement.originTime },
      },
    ],
  };

  return { input, slotBySessionId, currentPlacement, planVersionId, weekStart, blockedWindow };
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
