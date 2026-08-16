"use client";

import { useState } from "react";
import type { TodaySessionView } from "@hybride/domain";

import { NotDoneBadge, PlacementBadge } from "./placement-badge";
import { formatOriginLabel, PlacementChange } from "./placement-change";
import { ReportIncidentButton } from "./report-incident-button";

const SESSION_TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Force",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

function metaLine(session: TodaySessionView): string {
  const parts: string[] = [];
  if (session.durationMin) parts.push(`${session.durationMin} min`);
  if (session.intensityZone) parts.push(session.intensityZone);
  if (session.sportCode) parts.push(session.sportCode);
  return parts.join("    ");
}

/**
 * `PlanningSessionCard` — les 4 états de carte séance (`10-design-feature3-notes.md` §1.4-§1.6,
 * amendement `11-design-notes.md` §3.4). Client Component : après un signalement d'imprévu, la
 * carte passe d'état SUR PLACE (état d'arrivée = la réponse de `POST /schedule/incidents`, jamais
 * un rechargement de page).
 *
 * Simplification documentée : l'état (d) « Non réalisée » est approximé par `session.log.completion
 * === 'not_done'` — le discriminant EXACT « automatique vs déclaré » (`schedule_incidents.resulting_session_log_id`,
 * ADR-017 §8) n'est pas encore branché sur cette lecture (`fetchWeekPlan`/`fetchTodaySessionView`
 * n'exposent pas ce distinguo). Sans conséquence sur AC3/AC4 (états a/b/c, cœur de cette US) ; à
 * corriger dans une passe ultérieure en étendant `SessionPlacementView` ou une jointure dédiée.
 */
export function PlanningSessionCard({ dayLabel, session }: { dayLabel: string; session: TodaySessionView }) {
  const [placement, setPlacement] = useState(session.placement);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const label = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;
  const isNotDone = session.log?.completion === "not_done";
  const status = placement?.status ?? "scheduled";

  const liseredClass = isNotDone || status === "cancelled_week" ? "border-l-border-strong" : status === "moved" ? "border-l-warning" : "border-l-transparent";

  const ariaLabelParts = [dayLabel, placement?.scheduledTime ?? "", label];
  if (isNotDone) ariaLabelParts.push("comptée comme non réalisée");
  else if (status === "moved") ariaLabelParts.push(`déplacée depuis ${formatOriginLabel(placement!.origin!.date, placement!.origin!.time)}`);
  else if (status === "cancelled_week") ariaLabelParts.push("annulée cette semaine : aucun créneau ne permettait de la placer. Elle n'est pas reportée à la semaine prochaine.");

  return (
    <li className={`flex flex-col gap-2 rounded-lg border-l-[3px] bg-surface p-5 ${liseredClass}`} aria-label={ariaLabelParts.join(", ")} data-testid="planning-session-card">
      {isNotDone ? (
        <NotDoneBadge />
      ) : status !== "scheduled" ? (
        <PlacementBadge status={status} />
      ) : null}

      {status === "cancelled_week" ? (
        <PlacementChange originLabel={formatOriginLabel(placement!.origin!.date, placement!.origin!.time)} destinationLabel="Annulée" />
      ) : status === "moved" || isNotDone ? (
        <PlacementChange
          originLabel={formatOriginLabel(placement!.origin!.date, placement!.origin!.time)}
          destinationLabel={placement!.scheduledTime ?? ""}
          destinationTone={isNotDone ? "subtle" : "warning"}
        />
      ) : (
        <p className="text-small text-foreground">{placement?.scheduledTime}</p>
      )}

      <p className={`text-heading font-normal ${status === "cancelled_week" || isNotDone ? "text-foreground-muted" : "text-foreground"}`}>{label}</p>
      <p className="text-small text-foreground-subtle">{metaLine(session)}</p>

      {status === "cancelled_week" ? (
        <>
          <p className="text-small text-foreground-subtle">Aucun créneau disponible cette semaine.</p>
          <p className="text-small text-foreground-subtle">Elle n&apos;est pas reportée à la semaine prochaine.</p>
        </>
      ) : status === "moved" ? (
        <p className="text-small text-foreground-subtle">Déplacée suite à un imprévu signalé.</p>
      ) : null}

      {isNotDone ? (
        <p className="text-small text-foreground-subtle">Je l&apos;ai comptée comme non réalisée après ton imprévu.</p>
      ) : null}

      {status !== "cancelled_week" && !isNotDone ? (
        <ReportIncidentButton
          plannedSessionId={session.id}
          sessionLabel={`${label} ${placement?.scheduledTime ? `du ${dayLabel} ${placement.scheduledTime}` : ""}`}
          disabled={placement ? !placement.canReportIncident : true}
          onResolved={(outcome) => {
            setAnnouncement(outcome.message);
            // Le placement affiché est réinterrogé au prochain rendu serveur (revalidation de
            // page) ; en attendant, on masque le CTA pour éviter un double clic sur une carte
            // dont on sait déjà que l'état a changé.
            setPlacement((current) => (current ? { ...current, canReportIncident: false } : current));
          }}
        />
      ) : null}

      <p aria-live="polite" className="sr-only" data-testid="planning-session-announcement">
        {announcement}
      </p>
    </li>
  );
}
