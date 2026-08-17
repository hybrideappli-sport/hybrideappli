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
 * L'état (d) « Non réalisée » se base sur `placement.isAutomaticNotDone` — le discriminant EXACT
 * « automatique vs déclaré » d'ADR-017 §8, propagé par `fetchTodaySessionView()` — jamais sur
 * `session.log.completion === 'not_done'` seul (finding B4, revue post-`aaba499` : un `not_done`
 * saisi par l'utilisateur sans imprévu ne doit jamais afficher cet état).
 *
 * Deux règles de préséance strictes (`11-design-notes.md` §3.4) :
 *   1. (d) prime sur (b) : une séance déplacée puis non réalisée affiche `NON RÉALISÉE`.
 *   2. (c) prime sur (d) : une séance annulée n'affiche jamais `NON RÉALISÉE`, même si un
 *      `session_log` `not_done` existe en base.
 *
 * `placement` peut être `null` (fenêtre transitoire avant `materializeSessionPlacements()`,
 * `packages/domain/src/onboarding.ts:218-224`) : aucun champ dérivé de `placement` (`origin`,
 * `scheduledTime`, `isAutomaticNotDone`…) n'est déréférencé sans vérifier son existence (finding B3).
 */
export function PlanningSessionCard({ dayLabel, session }: { dayLabel: string; session: TodaySessionView }) {
  const [placement, setPlacement] = useState(session.placement);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const label = SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType;
  const status = placement?.status ?? "scheduled";
  const origin = placement?.origin ?? null;
  const scheduledTime = placement?.scheduledTime ?? null;

  const isCancelled = status === "cancelled_week";
  const isMoved = status === "moved";
  // Règle 2 : (c) prime sur (d).
  const isAutomaticNotDone = !isCancelled && Boolean(placement?.isAutomaticNotDone);

  // Règle 1 : (d) prime sur (b). Précédence du badge : cancelled > not_done > moved > none.
  const badge: "cancelled" | "not_done" | "moved" | "none" = isCancelled
    ? "cancelled"
    : isAutomaticNotDone
      ? "not_done"
      : isMoved
        ? "moved"
        : "none";

  const liseredClass =
    badge === "cancelled" || badge === "not_done" ? "border-l-border-strong" : badge === "moved" ? "border-l-warning" : "border-l-transparent";

  // Motif « ancien → nouveau » : montré pour une annulation, ou pour un déplacement réel (que la
  // séance soit ensuite comptée non réalisée ou non) — jamais pour un `not_done` sur une séance
  // restée à son horaire d'origine (design §3.4, ligne 2 : « mar. 18h30 » seul dans ce cas).
  const showOriginArrow = (isCancelled || isMoved) && origin !== null;
  const destinationLabel = isCancelled ? "Annulée" : (scheduledTime ?? "");
  const destinationTone = isAutomaticNotDone ? "subtle" : "warning";

  const ariaLabelParts = [dayLabel, scheduledTime ?? "", label];
  if (badge === "not_done") ariaLabelParts.push("comptée comme non réalisée après un imprévu");
  else if (badge === "moved" && origin) ariaLabelParts.push(`déplacée depuis ${formatOriginLabel(origin.date, origin.time)}`);
  else if (badge === "cancelled") ariaLabelParts.push("annulée cette semaine : aucun créneau ne permettait de la placer. Elle n'est pas reportée à la semaine prochaine.");

  return (
    <li className={`flex flex-col gap-2 rounded-lg border-l-[3px] bg-surface p-5 ${liseredClass}`} aria-label={ariaLabelParts.join(", ")} data-testid="planning-session-card">
      {badge === "not_done" ? <NotDoneBadge /> : badge !== "none" ? <PlacementBadge status={status} /> : null}

      {showOriginArrow && origin ? (
        <PlacementChange originLabel={formatOriginLabel(origin.date, origin.time)} destinationLabel={destinationLabel} destinationTone={destinationTone} />
      ) : (
        <p className={`text-small ${isAutomaticNotDone ? "text-foreground-subtle" : "text-foreground"}`}>{scheduledTime}</p>
      )}

      <p className={`text-heading font-normal ${isCancelled || isAutomaticNotDone ? "text-foreground-muted" : "text-foreground"}`}>{label}</p>
      <p className="text-small text-foreground-subtle">{metaLine(session)}</p>

      {isCancelled ? (
        <>
          <p className="text-small text-foreground-subtle">Aucun créneau disponible cette semaine.</p>
          <p className="text-small text-foreground-subtle">Elle n&apos;est pas reportée à la semaine prochaine.</p>
        </>
      ) : isMoved && !isAutomaticNotDone ? (
        <p className="text-small text-foreground-subtle">Déplacée suite à un imprévu signalé.</p>
      ) : null}

      {isAutomaticNotDone ? <p className="text-small text-foreground-subtle">Je l&apos;ai comptée comme non réalisée après ton imprévu.</p> : null}

      {!isCancelled && !isAutomaticNotDone ? (
        <ReportIncidentButton
          plannedSessionId={session.id}
          sessionLabel={`${label} ${scheduledTime ? `du ${dayLabel} ${scheduledTime}` : ""}`}
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
