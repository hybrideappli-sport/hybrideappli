import type { TodaySessionView } from "@hybride/domain";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExplanationInline } from "@/components/coach/explanation-inline";
import { sportLabel } from "@/lib/sport-labels";

const SESSION_TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  tempo: "Tempo",
  interval: "Fractionné",
  long: "Sortie longue",
  strength: "Renforcement",
  power: "Puissance",
  mobility: "Mobilité",
  technique: "Technique",
  cross_training: "Cross-training",
  rest: "Repos",
};

/** `SessionDetail` — AC1, AC10 : séance du jour, prescription complète + mention d'interférence. */
export async function SessionDetail({ session }: { session: TodaySessionView }) {
  const discipline = await sportLabel(session.sportCode);

  return (
    <Card data-testid="session-detail">
      <CardHeader>
        <CardTitle>{SESSION_TYPE_LABELS[session.sessionType] ?? session.sessionType}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body text-foreground-muted">
        <div className="flex gap-4 text-small text-foreground-subtle">
          {discipline ? <span>{discipline}</span> : null}
          {session.durationMin ? <span>{session.durationMin} min</span> : null}
          {session.intensityZone ? <span>Zone {session.intensityZone}</span> : null}
        </div>

        {session.prescription ? (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-medium text-foreground">Échauffement — </span>
              {session.prescription.warmup}
            </p>
            <p>
              <span className="font-medium text-foreground">Corps de séance — </span>
              {session.prescription.body}
            </p>
            <p>
              <span className="font-medium text-foreground">Retour au calme — </span>
              {session.prescription.cooldown}
            </p>
          </div>
        ) : null}

        {session.interferenceNote ? (
          <p className="text-caption text-foreground-subtle" data-testid="interference-note">
            {session.interferenceNote}
          </p>
        ) : null}

        <ExplanationInline short={session.explanation.short} explanationId={session.explanation.explanationId} />
      </CardContent>
    </Card>
  );
}
